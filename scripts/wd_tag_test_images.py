from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence, Tuple

import cv2
import numpy as np
import onnxruntime as ort
from PIL import Image

IMAGE_SIZE = 448
DEFAULT_MODEL_DIR = Path("models/wd-vit-tagger-v3")
DEFAULT_ONNX = "model.onnx"
DEFAULT_TAGS = "selected_tags.csv"

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".bmp",
    ".gif",
}


@dataclass
class TagLists:
    rating: List[str]
    general: List[str]
    character: List[str]


@dataclass
class OnnxRunner:
    session: ort.InferenceSession
    input_name: str
    output_name: str
    expects_nhwc: bool

    @classmethod
    def from_path(cls, onnx_path: Path) -> "OnnxRunner":
        providers = ["CPUExecutionProvider"]
        session = ort.InferenceSession(str(onnx_path), providers=providers)
        inputs = session.get_inputs()
        outputs = session.get_outputs()
        if not inputs or not outputs:
            raise RuntimeError("ONNX 模型缺少输入或输出")
        input_name = inputs[0].name
        output_name = outputs[0].name
        shape = inputs[0].shape or []
        channel_first = shape[1] if len(shape) > 1 else None
        channel_last = shape[3] if len(shape) > 3 else None
        expects_nhwc = False
        if isinstance(channel_last, int) and channel_last in (1, 3):
            if not isinstance(channel_first, int) or channel_first not in (1, 3):
                expects_nhwc = True
        return cls(session=session, input_name=input_name, output_name=output_name, expects_nhwc=expects_nhwc)

    def infer(self, batch: np.ndarray) -> np.ndarray:
        outputs = self.session.run([self.output_name], {self.input_name: batch})[0]
        if not isinstance(outputs, np.ndarray):
            outputs = np.asarray(outputs, dtype=np.float32)
        if outputs.dtype != np.float32:
            outputs = outputs.astype(np.float32)
        return outputs


def _iter_images(root: Path) -> Sequence[Path]:
    files: List[Path] = []
    for entry in sorted(root.iterdir()):
        if entry.is_file() and entry.suffix.lower() in IMAGE_EXTENSIONS:
            files.append(entry)
    return files


def _load_tag_lists(csv_path: Path) -> TagLists:
    rating: List[str] = []
    general: List[str] = []
    character: List[str] = []
    with csv_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("name") or "").strip()
            if not name:
                continue
            category = row.get("category")
            if category == "9":
                rating.append(name)
            elif category == "0":
                general.append(name)
            elif category == "4":
                character.append(name)
    if not rating or not general:
        raise RuntimeError(f"标签文件格式异常: {csv_path}")
    return TagLists(rating=rating, general=general, character=character)


def _open_image(path: Path) -> Image.Image | None:
    try:
        with Image.open(path) as raw:
            return raw.convert("RGB")
    except Exception:
        return None


def _preprocess_image(image: Image.Image) -> np.ndarray:
    array = np.array(image)[:, :, ::-1]  # RGB -> BGR
    h, w = array.shape[:2]
    size = max(h, w)
    pad_x = size - w
    pad_y = size - h
    pad_left = pad_x // 2
    pad_right = pad_x - pad_left
    pad_top = pad_y // 2
    pad_bottom = pad_y - pad_top
    array = np.pad(
        array,
        ((pad_top, pad_bottom), (pad_left, pad_right), (0, 0)),
        mode="constant",
        constant_values=255,
    )
    interp = cv2.INTER_AREA if size > IMAGE_SIZE else cv2.INTER_LANCZOS4
    array = cv2.resize(array, (IMAGE_SIZE, IMAGE_SIZE), interpolation=interp)
    array = array.astype(np.float32)
    return array


def _build_batch(images: List[np.ndarray], expects_nhwc: bool) -> np.ndarray:
    stacked = np.stack(images, axis=0)
    if expects_nhwc:
        return stacked
    # 默认模型是 NCHW
    stacked = np.transpose(stacked, (0, 3, 1, 2))
    return stacked


def _select_tags(
    probs: np.ndarray,
    tags: TagLists,
    *,
    general_threshold: float,
    character_threshold: float,
    max_tags: int,
) -> Tuple[List[Tuple[str, float]], List[Tuple[str, float]], List[Tuple[str, float]]]:
    rating_len = len(tags.rating)
    general_len = len(tags.general)

    rating_probs = probs[:rating_len]
    general_probs = probs[rating_len : rating_len + general_len]
    character_probs = probs[rating_len + general_len :]

    rating_pairs = list(zip(tags.rating, rating_probs))
    general_pairs = [(name, float(value)) for name, value in zip(tags.general, general_probs) if value >= general_threshold]
    character_pairs = [
        (name, float(value)) for name, value in zip(tags.character, character_probs) if value >= character_threshold
    ]

    general_pairs.sort(key=lambda item: item[1], reverse=True)
    character_pairs.sort(key=lambda item: item[1], reverse=True)
    if max_tags > 0:
        general_pairs = general_pairs[:max_tags]
    return rating_pairs, general_pairs, character_pairs


def _write_txt(path: Path, rating: Iterable[Tuple[str, float]], tags: Iterable[Tuple[str, float]]) -> None:
    lines = []
    for name, score in rating:
        lines.append(f"{name}\t{score:.4f}")
    for name, score in tags:
        lines.append(f"{name}\t{score:.4f}")
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def run_tagging(
    image_dir: Path,
    *,
    model_dir: Path,
    min_conf: float,
    char_conf: float,
    max_tags: int,
) -> None:
    resolved_dir = image_dir.expanduser().resolve()
    if not resolved_dir.exists() or not resolved_dir.is_dir():
        raise SystemExit(f"目录不存在或非文件夹: {resolved_dir}")

    image_paths = _iter_images(resolved_dir)
    if not image_paths:
        print(f"[wd-tag] 没有找到图片: {resolved_dir}")
        return

    model_dir = model_dir.expanduser().resolve()
    onnx_path = model_dir / DEFAULT_ONNX
    tags_path = model_dir / DEFAULT_TAGS
    if not onnx_path.exists():
        raise SystemExit(f"未找到 ONNX 模型: {onnx_path}")
    if not tags_path.exists():
        raise SystemExit(f"未找到标签文件: {tags_path}")

    tag_lists = _load_tag_lists(tags_path)
    runner = OnnxRunner.from_path(onnx_path)

    print(
        f"[wd-tag] 模型={onnx_path.name}, 图片数={len(image_paths)}, "
        f"general_thr={min_conf}, character_thr={char_conf}, max_tags={max_tags}"
    )

    preprocessed: List[np.ndarray] = []
    keep_paths: List[Path] = []
    for path in image_paths:
        pil = _open_image(path)
        if pil is None:
            print(f"[wd-tag] 无法读取，跳过: {path}")
            continue
        preprocessed.append(_preprocess_image(pil))
        keep_paths.append(path)

    if not preprocessed:
        print("[wd-tag] 没有可处理的图片")
        return

    batch = _build_batch(preprocessed, runner.expects_nhwc)
    outputs = runner.infer(batch)

    for path, probs in zip(keep_paths, outputs):

        ratings, general, characters = _select_tags(
            probs,
            tag_lists,
            general_threshold=min_conf,
            character_threshold=char_conf,
            max_tags=max_tags,
        )
        # 仅输出 rating + general + character (character 接在 general 后)
        merged = general + characters
        _write_txt(path.with_suffix(".txt"), ratings, merged)
        print(f"[wd-tag] 写入 {path.with_suffix('.txt').name} (general={len(general)}, character={len(characters)})")


def main() -> None:
    parser = argparse.ArgumentParser(description="使用 wd-vit-tagger-v3 ONNX 为小量图片打标签。")
    parser.add_argument("image_dir", help="包含图片的目录")
    parser.add_argument(
        "--model-dir",
        default=str(DEFAULT_MODEL_DIR),
        help="模型目录（需包含 model.onnx 与 selected_tags.csv），默认 models/wd-vit-tagger-v3",
    )
    parser.add_argument("--min-conf", type=float, default=0.35, help="general 标签阈值，默认 0.35")
    parser.add_argument("--char-conf", type=float, default=0.6, help="character 标签阈值，默认 0.6")
    parser.add_argument("--max-tags", type=int, default=64, help="general 标签最大数量，默认 64")
    args = parser.parse_args()

    run_tagging(
        Path(args.image_dir),
        model_dir=Path(args.model_dir),
        min_conf=args.min_conf,
        char_conf=args.char_conf,
        max_tags=args.max_tags,
    )


if __name__ == "__main__":
    main()


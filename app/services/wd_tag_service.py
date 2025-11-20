from __future__ import annotations

import csv
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

import cv2
import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from huggingface_hub import hf_hub_download
from sqlalchemy.orm import Session
from transformers import AutoImageProcessor, AutoModelForImageClassification
from types import SimpleNamespace

from app.db import Media, MediaTag, TagDefinition
from app.services.exceptions import MediaNotFoundError, TagModelNotReadyError, TagRebuildError, TagWhitelistError


_MODEL_ALIASES = {
    "wd-vit": "SmilingWolf/wd-v1-4-vit-tagger-v3",
    "wd-v3": "SmilingWolf/wd-v1-4-swinv2-tagger-v3",
    "wd-swinv2": "SmilingWolf/wd-v1-4-swinv2-tagger-v3",
    "wd-convnext": "SmilingWolf/wd-v1-4-convnext-tagger-v3",
    "wd14": "SmilingWolf/wd-v1-4-swinv2-tagger-v3",
}

_LOCAL_WD_MODEL_DIR = Path(os.environ.get("WD_TAG_MODEL_DIR", "models/wd-vit-tagger-v3")).expanduser()
_LOCAL_ALIAS_KEYS = {"wd-vit", "wd-v3", "wd-swinv2", "wd-convnext", "wd14"}

_DEFAULT_MODEL = os.environ.get("WD_TAG_MODEL") or (
    str(_LOCAL_WD_MODEL_DIR) if _LOCAL_WD_MODEL_DIR.exists() else "wd-v3"
)
_DEFAULT_DEVICE = os.environ.get("WD_TAG_DEVICE", "cpu")
_DEFAULT_WHITELIST = os.environ.get("WD_TAG_WHITELIST", "app/data/wdtag-whitelist.txt")
_WHITELIST_ENABLED = os.environ.get("WD_TAG_WHITELIST_ENABLED", "1").strip().lower() not in {"0", "false", "off"}
_MIN_CONFIDENCE = float(os.environ.get("WD_TAG_MIN_CONF", "0.35"))
_MAX_TAGS = int(os.environ.get("WD_TAG_MAX_TAGS", "0"))
_WD_TAG_ONNX_FILENAME = os.environ.get("WD_TAG_ONNX_FILE", "model.onnx")
_WD_TAG_ORT_PROVIDERS = os.environ.get("WD_TAG_ORT_PROVIDERS", "CPUExecutionProvider")

_processor_cache: Dict[str, AutoImageProcessor] = {}
_model_cache: Dict[str, AutoModelForImageClassification] = {}
_whitelist_cache: Dict[str, Tuple[float, Set[str]]] = {}

# macOS + timm 多线程初始化偶尔崩溃，强制把线程数调低。
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")


@dataclass
class _TagPrediction:
    name: str
    confidence: float


@dataclass
class _TagLists:
    """与 scripts/wd_tag_test_images.py 中 TagLists 对齐，用于拆分 rating/general/character 段。"""

    rating: List[str]
    general: List[str]
    character: List[str]


def _compute_weight(confidence: float) -> float:
    """目前直接把置信度作为权重，后续可按需扩展加权策略。"""
    if confidence is None:
        return 0.0
    return max(0.0, min(float(confidence), 1.0))


class _OnnxTagModel:
    def __init__(
        self,
        *,
        model_name: str,
        onnx_path: Path,
        session: ort.InferenceSession,
        id2label: Dict[int, str],
    ) -> None:
        self.model_name = model_name
        self.onnx_path = onnx_path
        self.session = session
        inputs = session.get_inputs()
        outputs = session.get_outputs()
        if not inputs or not outputs:
            raise TagModelNotReadyError("ONNX 模型缺少输入或输出张量")
        self.input_name = inputs[0].name
        self.output_name = outputs[0].name
        self.config = SimpleNamespace(id2label=id2label)
        input_shape = inputs[0].shape or []
        channel_first = input_shape[1] if len(input_shape) > 1 else None
        channel_last = input_shape[3] if len(input_shape) > 3 else None
        self._expects_nhwc = False
        if isinstance(channel_last, int) and channel_last in (1, 3):
            if not isinstance(channel_first, int) or channel_first not in (1, 3):
                self._expects_nhwc = True

    def to(self, device: torch.device):  # pragma: no cover - 兼容 PyTorch 接口
        return self

    def eval(self):  # pragma: no cover - 兼容 PyTorch 接口
        return self

    def predict(self, processor: AutoImageProcessor, images: List[Image.Image]) -> List[List[_TagPrediction]]:
        if not images:
            return []
        encoded = processor(images=images, return_tensors="pt")
        pixels = encoded.get("pixel_values")
        if pixels is None:
            raise TagModelNotReadyError("ONNX 模型预处理失败: 缺少 pixel_values")
        if isinstance(pixels, torch.Tensor):
            pixels = pixels.detach().cpu().numpy()
        if not isinstance(pixels, np.ndarray):
            pixels = np.asarray(pixels)
        if pixels.dtype != np.float32:
            pixels = pixels.astype(np.float32)
        if self._expects_nhwc and pixels.ndim == 4:
            pixels = np.transpose(pixels, (0, 2, 3, 1))
        outputs = self.session.run([self.output_name], {self.input_name: pixels})[0]
        if not isinstance(outputs, np.ndarray):
            outputs = np.asarray(outputs, dtype=np.float32)
        if outputs.dtype != np.float32:
            outputs = outputs.astype(np.float32)
        # 当 ONNX 导出的是 Sigmoid 后的概率值（范围 0-1）时不要重复做 sigmoid。
        if outputs.size > 0 and float(np.min(outputs)) >= 0.0 and float(np.max(outputs)) <= 1.0:
            probs = outputs
        else:
            probs = 1.0 / (1.0 + np.exp(-outputs))
        return _build_predictions_from_array(probs, self.config.id2label)


def _parse_ort_providers(raw: Optional[str]) -> List[str]:
    if not raw:
        return ["CPUExecutionProvider"]
    providers = [item.strip() for item in raw.split(",") if item.strip()]
    return providers or ["CPUExecutionProvider"]


def _resolve_processor_source(model_name: str) -> str:
    path = Path(model_name).expanduser()
    if path.is_file():
        return str(path.parent)
    if path.is_dir():
        return str(path)
    return model_name


def _resolve_onnx_path(model_name: str) -> Optional[Path]:
    path = Path(model_name).expanduser()
    if path.is_file() and path.suffix.lower() == ".onnx":
        return path.resolve()
    if path.is_dir():
        default = path / _WD_TAG_ONNX_FILENAME
        if default.exists():
            return default.resolve()
        for candidate in sorted(path.glob("*.onnx")):
            return candidate.resolve()
    return None


def _load_onnx_model(model_name: str, onnx_path: Path) -> _OnnxTagModel:
    providers = _parse_ort_providers(_WD_TAG_ORT_PROVIDERS)
    session_options = ort.SessionOptions()
    try:
        session = ort.InferenceSession(
            str(onnx_path),
            sess_options=session_options,
            providers=providers,
        )
    except Exception as exc:  # pragma: no cover - 依赖底层环境
        raise TagModelNotReadyError(f"加载 ONNX 模型失败: {onnx_path}") from exc

    names = _load_tag_list(model_name)
    if not names:
        names = _load_tag_list(str(onnx_path.parent))
    if not names:
        raise TagModelNotReadyError("缺少 selected_tags.csv，无法匹配标签名称。")
    id2label = {idx: name for idx, name in enumerate(names)}
    return _OnnxTagModel(model_name=model_name, onnx_path=onnx_path, session=session, id2label=id2label)


def _build_predictions_from_array(array: np.ndarray, id2label: Dict[int, str]) -> List[List[_TagPrediction]]:
    predictions: List[List[_TagPrediction]] = []
    for row in array:
        entries: List[_TagPrediction] = []
        values = row.tolist()
        for idx, score in enumerate(values):
            label = id2label.get(idx) or id2label.get(str(idx)) or str(idx)
            entries.append(_TagPrediction(name=label, confidence=float(score)))
        entries.sort(key=lambda item: item.confidence, reverse=True)
        predictions.append(entries)
    return predictions

def _resolve_model_name(name: Optional[str]) -> str:
    raw = name.strip() if isinstance(name, str) else None
    if not raw:
        raw = _DEFAULT_MODEL
    lowered = raw.strip().lower()
    if _LOCAL_WD_MODEL_DIR.exists() and lowered in _LOCAL_ALIAS_KEYS:
        resolved = str(_LOCAL_WD_MODEL_DIR)
    else:
        resolved = _MODEL_ALIASES.get(lowered, raw)
    path = Path(resolved).expanduser()
    if path.exists():
        try:
            return str(path.resolve())
        except OSError:
            return str(path)
    return resolved


def _resolve_device() -> torch.device:
    requested = _DEFAULT_DEVICE.strip().lower()
    if requested.startswith("cuda") and not torch.cuda.is_available():
        return torch.device("cpu")
    if requested in {"cpu", "cuda"}:
        return torch.device(requested)
    if requested.startswith("mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


def _get_processor(model_name: str) -> AutoImageProcessor:
    source = _resolve_processor_source(model_name)
    cached = _processor_cache.get(source)
    if cached:
        return cached
    try:
        processor = AutoImageProcessor.from_pretrained(source, trust_remote_code=True)
    except OSError as exc:
        raise TagModelNotReadyError(
            "无法下载标签模型，请确认已在 HuggingFace 接受协议并配置 HUGGINGFACE_HUB_TOKEN。"
        ) from exc
    _processor_cache[source] = processor
    return processor


def _get_model(model_name: str) -> AutoModelForImageClassification:
    """
    优先使用本地 ONNX 模型（与 wd_tag_test_images.py 一致），仅在不存在 ONNX 文件时回退到 HF 权重。
    若缓存中已有 HF 模型，而本地出现了 ONNX，则会用 ONNX 覆盖缓存，避免混用两种推理路径。
    """
    onnx_path = _resolve_onnx_path(model_name)
    if onnx_path:
        cached = _model_cache.get(model_name)
        if isinstance(cached, _OnnxTagModel) and getattr(cached, "onnx_path", None) == onnx_path:
            return cached
        model = _load_onnx_model(model_name, onnx_path)
        _model_cache[model_name] = model
        return model

    cached = _model_cache.get(model_name)
    if cached:
        return cached
    try:
        model = AutoModelForImageClassification.from_pretrained(model_name, trust_remote_code=True)
    except OSError as exc:
        raise TagModelNotReadyError(
            "无法加载 wd-vit-tagger-v3，请检查模型名或网络权限。"
        ) from exc
    _inject_tag_mapping(model, model_name)
    _model_cache[model_name] = model
    return model


def _inject_tag_mapping(model: AutoModelForImageClassification, model_name: str) -> None:
    current = model.config.id2label or {}
    if current and all(isinstance(v, str) and not v.startswith("LABEL_") for v in current.values()):
        return
    names = _load_tag_list(model_name)
    if not names:
        return
    num_labels = getattr(model.config, "num_labels", None)
    if isinstance(num_labels, int) and num_labels > 0 and len(names) != num_labels:
        return
    id2label = {idx: name for idx, name in enumerate(names)}
    label2id = {name: idx for idx, name in enumerate(names)}
    model.config.id2label = id2label
    model.config.label2id = label2id


def _load_tag_list(model_name: str) -> List[str]:
    # 优先查本地目录
    path = Path(model_name).expanduser()
    candidates: list[Path] = []
    if path.exists():
        if path.is_dir():
            candidates.append(path / "selected_tags.csv")
        elif path.is_file():
            candidates.append(path.parent / "selected_tags.csv")
    # 再查 HF 仓库
    if not candidates or not candidates[0].exists():
        try:
            hf_path = Path(hf_hub_download(repo_id=model_name, filename="selected_tags.csv"))
            candidates.append(hf_path)
        except Exception:
            pass
    for candidate in candidates:
        if candidate.exists():
            try:
                with candidate.open("r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    return [row.get("name", "").strip() for row in reader if row.get("name")]
            except Exception:
                continue
    return []


def _load_tag_lists(model_name: str) -> _TagLists:
    """
    仿照 scripts/wd_tag_test_images.py 中 _load_tag_lists：
    按 category 拆分 rating/general/character 段，保证与脚本行为一致。
    """
    path = Path(model_name).expanduser()
    candidates: list[Path] = []
    if path.exists():
        if path.is_dir():
            candidates.append(path / "selected_tags.csv")
        elif path.is_file():
            candidates.append(path.parent / "selected_tags.csv")
    if not candidates or not candidates[0].exists():
        raise TagModelNotReadyError(f"缺少 selected_tags.csv，无法加载标签定义: {model_name}")
    csv_path = candidates[0]
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
            if category == "9":  # rating
                rating.append(name)
            elif category == "0":  # general
                general.append(name)
            elif category == "4":  # character
                character.append(name)
    if not rating or not general:
        raise TagModelNotReadyError(f"标签文件格式异常: {csv_path}")
    return _TagLists(rating=rating, general=general, character=character)


def _select_tags_from_probs(
    probs: np.ndarray,
    tags: _TagLists,
    *,
    general_threshold: float,
    character_threshold: float,
    max_tags: int,
) -> List[_TagPrediction]:
    """
    按 scripts/wd_tag_test_images._select_tags 的策略，从概率向量中选出 rating/general/character。
    - rating 段不过滤；
    - general 段使用 general_threshold，并按得分排序后最多保留 max_tags 个；
    - character 段使用 character_threshold；
    返回顺序：rating + general(降序) + character(降序)。
    """
    rating_len = len(tags.rating)
    general_len = len(tags.general)

    rating_probs = probs[:rating_len]
    general_probs = probs[rating_len : rating_len + general_len]
    character_probs = probs[rating_len + general_len :]

    rating_pairs = list(zip(tags.rating, rating_probs))
    general_pairs = [
        (name, float(value))
        for name, value in zip(tags.general, general_probs)
        if float(value) >= general_threshold
    ]
    character_pairs = [
        (name, float(value))
        for name, value in zip(tags.character, character_probs)
        if float(value) >= character_threshold
    ]

    general_pairs.sort(key=lambda item: item[1], reverse=True)
    character_pairs.sort(key=lambda item: item[1], reverse=True)
    if max_tags > 0:
        general_pairs = general_pairs[:max_tags]

    merged: List[Tuple[str, float]] = rating_pairs + general_pairs + character_pairs
    return [_TagPrediction(name=name, confidence=float(score)) for name, score in merged]


def _resolve_base_dir(base_path: Optional[str]) -> Optional[Path]:
    if not base_path:
        return None
    raw = Path(base_path)
    if not raw.is_absolute():
        raw = Path(os.getcwd()) / raw
    resolved = raw.expanduser().resolve()
    if not resolved.exists():
        raise TagRebuildError(f"目录不存在: {resolved}")
    if not resolved.is_dir():
        raise TagRebuildError(f"目标必须是目录: {resolved}")
    return resolved


def _is_subpath(target: Path, root: Path) -> bool:
    try:
        target.relative_to(root)
        return True
    except ValueError:
        return False


def _collect_media(
    db: Session,
    *,
    base_dir: Optional[Path],
    media_ids: Optional[Sequence[int]],
    limit: Optional[int],
) -> tuple[List[tuple[Media, Path]], dict[str, int]]:
    stats = {"missing": 0, "out_of_scope": 0}
    query = db.query(Media).filter(Media.media_type == "image")
    if media_ids:
        query = query.filter(Media.id.in_(media_ids))
    query = query.order_by(Media.id.asc())
    if limit is not None and limit > 0:
        query = query.limit(limit)
    rows: List[tuple[Media, Path]] = []
    for media in query.all():
        try:
            abs_path = Path(media.absolute_path).expanduser().resolve()
        except Exception:
            stats["missing"] += 1
            continue
        if base_dir and not _is_subpath(abs_path, base_dir):
            stats["out_of_scope"] += 1
            continue
        if not abs_path.exists():
            stats["missing"] += 1
            continue
        rows.append((media, abs_path))
    return rows, stats


def _load_image(path: Path) -> Optional[Image.Image]:
    try:
        with Image.open(path) as raw:
            return raw.convert("RGB")
    except Exception:
        return None


def _preprocess_image_for_wd(image: Image.Image, *, image_size: int = 448) -> np.ndarray:
    """
    完全仿照 scripts/wd_tag_test_images._preprocess_image：
    - RGB -> BGR
    - 等比居中 padding 成正方形（空白填充 255）
    - resize 到 image_size（放大用 LANCZOS4，缩小用 AREA）
    - 转 float32，但不做额外归一化
    """
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
    interp = cv2.INTER_AREA if size > image_size else cv2.INTER_LANCZOS4
    array = cv2.resize(array, (image_size, image_size), interpolation=interp)
    array = array.astype(np.float32)
    return array


def _build_batch_for_wd(arrays: List[np.ndarray], expects_nhwc: bool) -> np.ndarray:
    """
    仿照 scripts/wd_tag_test_images._build_batch：
    - 打包为 (N,H,W,3) 或 (N,3,H,W)
    """
    if not arrays:
        return np.empty((0, 3, 448, 448), dtype=np.float32)
    stacked = np.stack(arrays, axis=0)
    if expects_nhwc:
        return stacked
    return np.transpose(stacked, (0, 3, 1, 2))


def _predict_batch(
    model: AutoModelForImageClassification | _OnnxTagModel,
    processor: AutoImageProcessor,
    device: torch.device,
    images: List[Image.Image],
) -> List[List[_TagPrediction]]:
    if isinstance(model, _OnnxTagModel):
        # 对于 WD 的 ONNX 模型，使用与 wd_tag_test_images.py 相同的预处理路径。
        if not images:
            return []
        arrays: List[np.ndarray] = []
        for img in images:
            arrays.append(_preprocess_image_for_wd(img))
        batch = _build_batch_for_wd(arrays, model._expects_nhwc)
        outputs = model.session.run([model.output_name], {model.input_name: batch})[0]
        if not isinstance(outputs, np.ndarray):
            outputs = np.asarray(outputs, dtype=np.float32)
        if outputs.dtype != np.float32:
            outputs = outputs.astype(np.float32)
        # ONNX 已输出概率（0-1），不要再次 sigmoid。
        if outputs.size > 0 and float(np.min(outputs)) < 0.0 or float(np.max(outputs)) > 1.0:
            outputs = 1.0 / (1.0 + np.exp(-outputs))
        return _build_predictions_from_array(outputs, model.config.id2label)
    inputs = processor(images=images, return_tensors="pt")
    inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits.detach()
    probs = torch.sigmoid(logits).cpu().numpy()
    id2label = model.config.id2label or {}
    return _build_predictions_from_array(probs, id2label)


def _load_whitelist(path: Optional[str]) -> tuple[Path, Set[str]]:
    raw = Path(path or _DEFAULT_WHITELIST)
    if not raw.is_absolute():
        raw = Path(os.getcwd()) / raw
    resolved = raw.expanduser().resolve()
    try:
        mtime = resolved.stat().st_mtime
    except FileNotFoundError as exc:
        raise TagWhitelistError(f"未找到标签白名单文件: {resolved}") from exc
    cached = _whitelist_cache.get(str(resolved))
    if cached and cached[0] == mtime:
        return resolved, set(cached[1])
    content = resolved.read_text(encoding="utf-8")
    tags = {
        line.strip()
        for line in content.splitlines()
        if line.strip() and not line.strip().startswith("#")
    }
    if not tags:
        raise TagWhitelistError(f"白名单 {resolved} 为空")
    _whitelist_cache[str(resolved)] = (mtime, tags)
    return resolved, tags


def _existing_tag_names(db: Session, media_id: int) -> Set[str]:
    return {
        row[0]
        for row in db.query(MediaTag.tag_name).filter(MediaTag.media_id == media_id).all()
    }


def _ensure_tag_definitions(db: Session, names: Set[str]) -> None:
    if not names:
        return
    existing = {
        row[0]
        for row in db.query(TagDefinition.name).filter(TagDefinition.name.in_(list(names))).all()
    }
    missing = [name for name in names if name not in existing]
    for tag in missing:
        db.add(TagDefinition(name=tag))
    if missing:
        db.flush()


def rebuild_tags(
    db: Session,
    *,
    base_path: Optional[str] = None,
    media_ids: Optional[Sequence[int]] = None,
    batch_size: int = 8,
    limit: Optional[int] = None,
    model_name: Optional[str] = None,
    whitelist_path: Optional[str] = None,
    min_confidence: Optional[float] = None,
    max_tags_per_media: Optional[int] = None,
    whitelist_enabled: Optional[bool] = None,
    character_min_confidence: Optional[float] = None,
) -> dict:
    started = time.time()
    base_dir = _resolve_base_dir(base_path)
    resolved_model = _resolve_model_name(model_name)
    processor = _get_processor(resolved_model)
    model = _get_model(resolved_model)
    device = _resolve_device()
    model.to(device)
    model.eval()

    # WD 标签重建不再使用白名单，仅保留数值阈值（行为与脚本一致）。
    whitelist_active = False
    whitelist_path_resolved: Optional[Path] = None
    whitelist: Optional[Set[str]] = None
    min_conf = float(min_confidence if min_confidence is not None else _MIN_CONFIDENCE)
    char_conf = float(character_min_confidence if character_min_confidence is not None else 0.6)
    max_tags = int(max_tags_per_media if max_tags_per_media is not None else _MAX_TAGS)
    if max_tags <= 0:
        max_tags = 0

    targets, target_stats = _collect_media(db, base_dir=base_dir, media_ids=media_ids, limit=limit)
    if not targets:
        raise MediaNotFoundError("没有可处理的图片，请先导入 '测试图片' 目录。")

    target_ids = [media.id for media, _ in targets]
    delete_query = db.query(MediaTag).filter(MediaTag.source_model == resolved_model)
    if target_ids:
        delete_query = delete_query.filter(MediaTag.media_id.in_(target_ids))
    deleted_rows = delete_query.delete(synchronize_session=False)

    processed = 0
    tagged_media = 0
    write_rows = 0
    decode_failed = 0

    tag_lists: Optional[_TagLists] = None
    if isinstance(model, _OnnxTagModel):
        tag_lists = _load_tag_lists(resolved_model)

    for start in range(0, len(targets), batch_size):
        chunk = targets[start : start + batch_size]
        images: List[Image.Image] = []
        alive: List[Media] = []
        for media, path in chunk:
            img = _load_image(path)
            if img is None:
                decode_failed += 1
                continue
            images.append(img)
            alive.append(media)
        if not images:
            continue

        if isinstance(model, _OnnxTagModel) and tag_lists is not None:
            # ONNX 路径：完全按 wd_tag_test_images.py 的方式选标签。
            arrays: List[np.ndarray] = []
            for img in images:
                arrays.append(_preprocess_image_for_wd(img))
            batch = _build_batch_for_wd(arrays, model._expects_nhwc)
            outputs = model.session.run([model.output_name], {model.input_name: batch})[0]
            if not isinstance(outputs, np.ndarray):
                outputs = np.asarray(outputs, dtype=np.float32)
            if outputs.dtype != np.float32:
                outputs = outputs.astype(np.float32)
            per_media_preds: List[List[_TagPrediction]] = []
            for row in outputs:
                per_media_preds.append(
                    _select_tags_from_probs(
                        row,
                        tag_lists,
                        general_threshold=min_conf,
                        character_threshold=char_conf,
                        max_tags=max_tags,
                    )
                )
        else:
            # 回退到通用 HF 路径。
            per_media_preds = _predict_batch(model, processor, device, images)

        for media, preds in zip(alive, per_media_preds):
            processed += 1
            filtered = [p for p in preds if p.confidence is not None]
            if not filtered:
                continue
            _ensure_tag_definitions(db, {p.name for p in filtered})
            existing_names = _existing_tag_names(db, media.id)
            for item in filtered:
                if item.name in existing_names:
                    continue
                db.add(
                    MediaTag(
                        media_id=media.id,
                        tag_name=item.name,
                        source_model=resolved_model,
                        confidence=float(round(item.confidence, 4)),
                        weight=float(round(_compute_weight(item.confidence), 4)),
                    )
                )
                existing_names.add(item.name)
                write_rows += 1
            tagged_media += 1

    db.commit()
    total_tags = (
        db.query(MediaTag)
        .filter(MediaTag.source_model == resolved_model, MediaTag.media_id.in_(target_ids))
        .count()
    )
    unique_tags = (
        db.query(MediaTag.tag_name)
        .filter(MediaTag.source_model == resolved_model, MediaTag.media_id.in_(target_ids))
        .distinct()
        .count()
    )

    duration = round(time.time() - started, 2)
    return {
        "model": resolved_model,
        "processed_media": processed,
        "tagged_media": tagged_media,
        "skipped_media": decode_failed + target_stats["missing"],
        "total_tag_rows": total_tags,
        "unique_tags": unique_tags,
        "whitelist_size": len(whitelist) if whitelist_active and whitelist is not None else -1,
        "deleted_old_rows": int(deleted_rows),
        "eligible_media": len(targets),
        "base_path": str(base_dir) if base_dir else None,
        "whitelist_path": str(whitelist_path_resolved) if whitelist_path_resolved else None,
        "min_confidence": min_conf,
        "max_tags_per_media": max_tags,
        "duration_seconds": duration,
    }


def list_media_tags(db: Session, media_id: int) -> dict:
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        raise MediaNotFoundError("媒体不存在")
    rows = (
        db.query(MediaTag)
        .filter(MediaTag.media_id == media.id)
        .order_by(MediaTag.confidence.desc().nullslast(), MediaTag.tag_name.asc())
        .all()
    )
    translations = _load_translations()
    return {
        "mediaId": media.id,
        "tags": [
            {
                "name": row.tag_name,
                "displayName": translations.get(row.tag_name),
                "sourceModel": row.source_model,
                "confidence": float(row.confidence) if row.confidence is not None else None,
                "weight": float(row.weight) if row.weight is not None else None,
            }
            for row in rows
        ],
    }


_translation_cache: dict[str, Tuple[float, Dict[str, str]]] = {}

def _load_translations() -> Dict[str, str]:
    data_path = Path(__file__).resolve().parent.parent / "data" / "tags-translate.csv"
    try:
        mtime = data_path.stat().st_mtime
    except FileNotFoundError:
        return {}
    cached = _translation_cache.get(str(data_path))
    if cached and cached[0] == mtime:
        return cached[1]
    result: Dict[str, str] = {}
    try:
        for line in data_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or "," not in line:
                continue
            en, zh = [part.strip() for part in line.split(",", 1)]
            if en and zh:
                result[en] = zh
    except Exception:
        result = {}
    _translation_cache[str(data_path)] = (mtime, result)
    return result

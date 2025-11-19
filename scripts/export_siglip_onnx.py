from __future__ import annotations

"""导出 SigLIP PyTorch 权重为 ONNX（文本/视觉编码器）。"""

import argparse
import json
import shutil
from pathlib import Path

import torch
from transformers import SiglipModel, SiglipProcessor

TEXT_ONNX = "siglip_text_encoder.onnx"
VISION_ONNX = "siglip_vision_encoder.onnx"
CONFIG_FILES = (
    "config.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "spiece.model",
)


class _TextEncoder(torch.nn.Module):
    def __init__(self, model: SiglipModel) -> None:
        super().__init__()
        self.model = model

    def forward(self, input_ids: torch.Tensor, attention_mask: torch.Tensor) -> torch.Tensor:  # noqa: D401
        return self.model.get_text_features(input_ids=input_ids, attention_mask=attention_mask)


class _VisionEncoder(torch.nn.Module):
    def __init__(self, model: SiglipModel) -> None:
        super().__init__()
        self.model = model

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:  # noqa: D401
        return self.model.get_image_features(pixel_values=pixel_values)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导出 SigLIP ONNX 编码器")
    parser.add_argument(
        "--source-model",
        default="models/siglip-base-patch16-224",
        help="SigLIP PyTorch 权重所在的目录或 HuggingFace 模型名",
    )
    parser.add_argument(
        "--output-dir",
        default="models/siglip-onnx",
        help="导出后的 ONNX 目录",
    )
    parser.add_argument("--opset", type=int, default=17, help="ONNX opset 版本")
    parser.add_argument("--overwrite", action="store_true", help="允许覆盖已存在的导出目录")
    return parser.parse_args()


def _prepare_output_dir(path: Path, overwrite: bool) -> None:
    if path.exists():
        if not overwrite:
            raise SystemExit(f"输出目录 {path} 已存在，添加 --overwrite 重试。")
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def _export_text(model: SiglipModel, path: Path, seq_len: int, opset: int) -> None:
    wrapper = _TextEncoder(model)
    wrapper.eval()
    dummy_ids = torch.ones(1, seq_len, dtype=torch.long)
    dummy_mask = torch.ones(1, seq_len, dtype=torch.long)
    torch.onnx.export(
        wrapper,
        (dummy_ids, dummy_mask),
        str(path),
        input_names=["input_ids", "attention_mask"],
        output_names=["text_embeds"],
        opset_version=opset,
        dynamic_axes=None,
        do_constant_folding=True,
    )


def _export_vision(model: SiglipModel, path: Path, height: int, width: int, opset: int) -> None:
    wrapper = _VisionEncoder(model)
    wrapper.eval()
    dummy_pixels = torch.randn(1, 3, height, width, dtype=torch.float32)
    torch.onnx.export(
        wrapper,
        (dummy_pixels,),
        str(path),
        input_names=["pixel_values"],
        output_names=["image_embeds"],
        opset_version=opset,
        dynamic_axes=None,
        do_constant_folding=True,
    )


def _ensure_configs(src: Path, dst: Path) -> None:
    missing = [name for name in CONFIG_FILES if not (dst / name).exists()]
    if not missing:
        return
    if not src.exists():
        raise SystemExit(
            "无法在输出目录生成配置文件，请提供本地模型目录 (source-model) 以便拷贝。"
        )
    for name in CONFIG_FILES:
        src_file = src / name
        if src_file.exists():
            shutil.copy2(src_file, dst / name)


def main() -> None:
    args = _parse_args()
    output_dir = Path(args.output_dir).expanduser().resolve()
    torch.set_grad_enabled(False)

    print(f"加载 SigLIP 模型: {args.source_model}")
    model = SiglipModel.from_pretrained(args.source_model)
    model.eval().to(torch.device("cpu"))
    processor = SiglipProcessor.from_pretrained(args.source_model)

    seq_len = int(model.config.text_config.max_position_embeddings)
    image_size = processor.image_processor.size
    height = int(image_size.get("height", image_size.get("shortest_edge", 224)))
    width = int(image_size.get("width", image_size.get("shortest_edge", 224)))

    print(f"导出目录: {output_dir}")
    _prepare_output_dir(output_dir, overwrite=args.overwrite)

    print("开始导出文本编码器...")
    _export_text(model, output_dir / TEXT_ONNX, seq_len, args.opset)

    print("开始导出视觉编码器...")
    _export_vision(model, output_dir / VISION_ONNX, height, width, args.opset)

    # 保存必要的配置/处理器文件，便于后续加载
    processor.save_pretrained(str(output_dir))
    model.config.to_json_file(str(output_dir / "config.json"))

    # 如果 source-model 是本地目录，确保 tokenizer.json / spiece.model 等被保留
    src_path = Path(args.source_model)
    if src_path.exists():
        _ensure_configs(src_path, output_dir)

    metadata = {
        "source": args.source_model,
        "output_dir": str(output_dir),
        "text_seq_len": seq_len,
        "image_size": {"height": height, "width": width},
        "dim": int(model.config.text_config.projection_size),
        "opset": args.opset,
    }
    (output_dir / "export_meta.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False))

    print("导出完成：")
    for name in (TEXT_ONNX, VISION_ONNX, "config.json", "preprocessor_config.json", "tokenizer.json", "spiece.model"):
        target = output_dir / name
        if target.exists():
            size_kb = target.stat().st_size / 1024
            print(f"  - {name}: {size_kb:.1f} KB")


if __name__ == "__main__":
    main()

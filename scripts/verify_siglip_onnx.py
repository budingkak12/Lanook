from __future__ import annotations

"""对比 SigLIP PyTorch 与 ONNX 编码器的输出，验证误差。"""

import argparse
from pathlib import Path
from typing import Sequence

import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from transformers import SiglipModel, SiglipProcessor

TEXT_ONNX = "siglip_text_encoder.onnx"
VISION_ONNX = "siglip_vision_encoder.onnx"


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = a.reshape(-1)
    b = b.reshape(-1)
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    return float(np.dot(a, b))


def _load_image(path: Path) -> Image.Image:
    with Image.open(path) as img:
        return img.convert("RGB")


def _run_text_pt(model: SiglipModel, processor: SiglipProcessor, texts: Sequence[str]) -> np.ndarray:
    model.eval()
    encoded = processor(
        text=texts,
        padding="max_length",
        truncation=True,
        return_attention_mask=True,
        return_tensors="pt",
    )
    with torch.no_grad():
        feats = model.get_text_features(
            input_ids=encoded["input_ids"],
            attention_mask=encoded["attention_mask"],
        )
    return feats.numpy()


def _run_text_onnx(session: ort.InferenceSession, processor: SiglipProcessor, texts: Sequence[str]) -> np.ndarray:
    encoded = processor(
        text=texts,
        padding="max_length",
        truncation=True,
        return_attention_mask=True,
        return_tensors="np",
    )
    inputs = {
        "input_ids": encoded["input_ids"].astype(np.int64),
        "attention_mask": encoded["attention_mask"].astype(np.int64),
    }
    return session.run(None, inputs)[0]


def _run_image_pt(model: SiglipModel, processor: SiglipProcessor, images: Sequence[Image.Image]) -> np.ndarray:
    encoded = processor(images=list(images), return_tensors="pt")
    with torch.no_grad():
        feats = model.get_image_features(pixel_values=encoded["pixel_values"])
    return feats.numpy()


def _run_image_onnx(session: ort.InferenceSession, processor: SiglipProcessor, images: Sequence[Image.Image]) -> np.ndarray:
    encoded = processor(images=list(images), return_tensors="np")
    inputs = {"pixel_values": encoded["pixel_values"].astype(np.float32)}
    return session.run(None, inputs)[0]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="SigLIP ONNX 精度回归")
    parser.add_argument("--onnx-dir", default="models/siglip-onnx", help="包含 ONNX 文件的目录")
    parser.add_argument("--source-model", default="models/siglip-base-patch16-224", help="PyTorch 权重目录")
    parser.add_argument("--image", default="测试图片/IMG_3718.JPG", help="用于对比的图片路径")
    parser.add_argument(
        "--text",
        default="一张室外人像照片",
        help="用于测试的中文描述",
    )
    parser.add_argument("--tolerance", type=float, default=1e-4, help="允许的余弦差异上限")
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    onnx_dir = Path(args.onnx_dir).expanduser().resolve()
    image_path = Path(args.image).expanduser().resolve()

    print(f"加载 PyTorch 模型: {args.source_model}")
    model = SiglipModel.from_pretrained(args.source_model)
    processor = SiglipProcessor.from_pretrained(args.source_model)

    text_session = ort.InferenceSession(str(onnx_dir / TEXT_ONNX), providers=["CPUExecutionProvider"])
    vision_session = ort.InferenceSession(str(onnx_dir / VISION_ONNX), providers=["CPUExecutionProvider"])

    texts = [args.text]
    images = [_load_image(image_path)]

    torch_text = _run_text_pt(model, processor, texts)[0]
    onnx_text = _run_text_onnx(text_session, processor, texts)[0]
    text_cos = _cosine(torch_text, onnx_text)
    text_delta = abs(1.0 - text_cos)

    torch_image = _run_image_pt(model, processor, images)[0]
    onnx_image = _run_image_onnx(vision_session, processor, images)[0]
    image_cos = _cosine(torch_image, onnx_image)
    image_delta = abs(1.0 - image_cos)

    print(f"文本向量余弦: {text_cos:.10f} (delta={text_delta:.2e})")
    print(f"图像向量余弦: {image_cos:.10f} (delta={image_delta:.2e})")

    if text_delta > args.tolerance or image_delta > args.tolerance:
        raise SystemExit("精度校验失败，delta 超过阈值。")
    print("校验通过：ONNX 与 PyTorch 输出一致。")


if __name__ == "__main__":
    main()

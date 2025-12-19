from __future__ import annotations

from pathlib import Path
from typing import Optional

from app.db import Media
from app.services.fs_providers import is_smb_url
from app.services.thumbnails_service import get_or_generate_thumbnail


def resolve_model_input_image_path(media: Media) -> Optional[Path]:
    """为 AI 模型推理解析“可读的图像输入路径”。

    约束与策略：
    - WD/CLIP/人脸等模型本质上都是“图像模型”，视频需要抽帧；
    - 对 video：统一使用视频缩略图（默认 1s 抽帧）作为输入；
    - 对 SMB/URL：优先走缩略图缓存，避免直接 Path 打开导致不可读；
    - 对本地 image：优先使用原图（保持精度），失败再回退缩略图。
    """
    if not media.absolute_path or not isinstance(media.absolute_path, str):
        return None

    abs_path = str(media.absolute_path)

    if media.media_type == "image" and not is_smb_url(abs_path):
        try:
            local_path = Path(abs_path).expanduser()
            if local_path.exists():
                return local_path
        except Exception:
            pass

    thumb = get_or_generate_thumbnail(media)
    return thumb.path if thumb else None


from __future__ import annotations

from sqlalchemy.orm import Session

from app.db import MEDIA_ROOT_KEY, SessionLocal, get_setting
from app.services import clip_service
from app.services.exceptions import ServiceError


def warmup_missing_clip_embeddings(limit: int | None = None) -> dict | None:
    """在后台为缺少向量的媒体增量构建 CLIP/SigLIP 向量。

    - 自动读取当前配置的 MEDIA_ROOT 作为 base_path（若存在且为本地目录）；
    - 若模型或向量目录缺失，仅记录日志，不中断主流程。
    """
    db: Session = SessionLocal()
    try:
        try:
            base_path = get_setting(db, MEDIA_ROOT_KEY)
        except Exception:
            base_path = None

        if isinstance(base_path, str):
            base_path_str: str | None = base_path
        else:
            base_path_str = None

        stats = clip_service.build_missing_embeddings(
            db,
            base_path=base_path_str,
            model_name=None,
            batch_size=8,
            limit=limit,
            only_active_sources=True,
        )
        print(
            f"[clip-warmup] 增量构建向量完成: "
            f"model={stats.get('model')}, processed={stats.get('processed')}, "
            f"missing_before={stats.get('missing_before')}, total_embeddings={stats.get('total_embeddings')}"
        )
        return stats
    except ServiceError as exc:
        # 业务错误（模型缺失、路径无效等）只记录日志，不抛出到上层
        print(f"[clip-warmup] 增量构建失败: {exc}")
        return None
    except Exception as exc:  # pragma: no cover - 运行期兜底
        print(f"[clip-warmup] 未预期错误: {exc}")
        return None
    finally:
        db.close()

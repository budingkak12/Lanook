from __future__ import annotations

from sqlalchemy.orm import Session

from app.db import MEDIA_ROOT_KEY, SessionLocal, get_setting
from app.services import clip_service
from app.services.exceptions import ServiceError


def warmup_missing_clip_embeddings(*, limit: int | None = None) -> dict | None:
    """在后台为缺少向量的媒体增量构建 CLIP/SigLIP 向量。

    - 自动读取当前配置的 MEDIA_ROOT 作为 base_path（若存在且为本地目录）；
    - 默认同时为 SigLIP（默认模型）和 Chinese-CLIP 生成向量，覆盖“以图/以文搜图”两种场景；
    - 若模型或向量目录缺失，仅记录日志，不中断主流程。
    """

    db: Session = SessionLocal()
    try:
        try:
            base_path = get_setting(db, MEDIA_ROOT_KEY)
        except Exception:
            base_path = None

        base_path_str = base_path if isinstance(base_path, str) else None

        # SigLIP（默认）+ Chinese-CLIP，两者缺一都会影响搜索体验。
        models = [None, "chinese-clip"]
        last_stats: dict | None = None

        for model in models:
            try:
                stats = clip_service.build_missing_embeddings(
                    db,
                    base_path=base_path_str,
                    model_name=model,
                    batch_size=8,
                    limit=limit,
                    only_active_sources=True,
                )
                print(
                    f"[clip-warmup] 增量构建向量完成: "
                    f"model={stats.get('model')}, processed={stats.get('processed')}, "
                    f"missing_before={stats.get('missing_before')}, total_embeddings={stats.get('total_embeddings')}"
                )
                last_stats = stats
            except ServiceError as exc:
                # 某个模型不可用时记录日志，继续下一个模型
                print(f"[clip-warmup] 模型 {model or 'default'} 增量构建失败: {exc}")
                continue

        return last_stats
    except Exception as exc:  # pragma: no cover - 运行期兜底
        print(f"[clip-warmup] 未预期错误: {exc}")
        return None
    finally:
        db.close()

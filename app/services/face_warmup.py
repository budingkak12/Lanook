from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.db import MEDIA_ROOT_KEY, SUPPORTED_VIDEO_EXTS, SessionLocal, get_setting
from app.db.models_extra import MediaSource
from app.services import face_cluster_service
from app.services.exceptions import ServiceError
from app.services.face_cluster_progress import FaceProgressState, get_face_progress


def _resolve_local_scan_roots(session: Session) -> List[str]:
    """解析当前需要参与人脸聚类的本地媒体根目录列表。

    规则：
    - 若存在 MediaSource 记录：以所有 active 且未删除的本地来源为准（忽略 smb:// 等远程路径）；
    - 若不存在任何来源记录：回退到 MEDIA_ROOT 配置（若为本地路径）。
    """
    roots: list[str] = []

    has_any_source = (session.query(MediaSource).count() or 0) > 0
    if has_any_source:
        active_sources = (
            session.query(MediaSource)
            .filter(
                (MediaSource.deleted_at.is_(None))
                & (MediaSource.status.is_(None) | (MediaSource.status == "active"))
            )
            .all()
        )
        for src in active_sources:
            if not src.root_path:
                continue
            path = str(src.root_path).strip()
            if not path or path.lower().startswith("smb://"):
                continue
            roots.append(path)

    if not roots and not has_any_source:
        try:
            raw = get_setting(session, MEDIA_ROOT_KEY)
        except Exception:
            raw = None
        if raw:
            value = str(raw).strip()
            if value and not value.lower().startswith("smb://"):
                roots.append(value)

    # 去重保持顺序
    deduped: list[str] = []
    seen: set[str] = set()
    for r in roots:
        if r not in seen:
            deduped.append(r)
            seen.add(r)
    return deduped


def warmup_rebuild_face_clusters(
    base_path: Optional[str] = None,
    similarity_threshold: float = 0.65,
) -> Optional[Tuple[int, int, int, str, str]]:
    """人脸暖机：对“所有本地媒体路径”视作一个总仓库执行一轮聚类重建。

    - 当前实现仅支持本地文件系统路径；SMB/URL 会被忽略；
    - 返回 (media_count, face_count, cluster_count, base_paths_repr, pipeline_signature)。
    """
    db: Session = SessionLocal()
    try:
        roots = _resolve_local_scan_roots(db)
        progress = get_face_progress()
        if not roots:
            progress.reset()
            print("[face-warmup] 未找到可用的本地媒体路径（可能全部为 SMB），跳过人脸暖机。")
            return None

        # 估算总文件数：仅统计受支持的图片后缀，供进度展示使用。
        total_files = 0
        try:
            for root in roots:
                root_path = Path(root).expanduser()
                if root_path.is_dir():
                    total_files += sum(
                        1
                        for p in root_path.rglob("*")
                        if p.is_file()
                        and p.suffix.lower() in ({".jpg", ".jpeg", ".png", ".webp", ".bmp"} | set(SUPPORTED_VIDEO_EXTS))
                    )
        except Exception:
            total_files = 0

        progress.start(total_files=total_files, base_paths=roots)

        # 所有本地媒体路径视为同一总仓库，统一聚类。
        media_count, face_count, cluster_count, paths, version = face_cluster_service.rebuild_clusters_for_paths(
            db,
            base_paths=roots,
            similarity_threshold=similarity_threshold,
            progress=progress,
        )
        base_repr = ", ".join(str(p) for p in paths)
        summary = (
            f"media={media_count}, faces={face_count}, "
            f"clusters={cluster_count}, bases={base_repr}, version={version}"
        )
        print(f"[face-warmup] 人脸暖机完成：{summary}")
        progress.done(message=summary)
        return media_count, face_count, cluster_count, base_repr, version
    except ServiceError as exc:
        # 模型缺失等业务异常只记录日志，不影响主流程
        print(f"[face-warmup] 人脸暖机失败：{exc}")
        get_face_progress().error(str(exc))
        return None
    except Exception as exc:  # pragma: no cover - 运行期兜底
        print(f"[face-warmup] 未预期错误：{exc}")
        get_face_progress().error(str(exc))
        return None
    finally:
        db.close()

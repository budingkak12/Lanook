from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple

from sqlalchemy.orm import Session

# 直接复用初始化脚本中的 ORM 模型
from 初始化数据库 import Media


# thumbnails 目录位于项目根目录，与 main.py 中保持一致的命名规则："thumbnails/<id>.jpg"
THUMBNAILS_DIR = Path(__file__).resolve().parents[2] / "thumbnails"


@dataclass
class FailedItem:
    id: int
    reason: str


def _thumb_path_for_id(media_id: int) -> Path:
    return THUMBNAILS_DIR / f"{media_id}.jpg"


def delete_media_record_and_files(
    db: Session, media: Media, *, delete_file: bool = True
) -> Tuple[bool, str | None]:
    """
    删除单个媒体：数据库记录 + 缩略图；可选删除原文件。

    返回 (success, reason)
    - success=True 表示记录已不可见（DB 已删除或记录不存在）。
    - 当返回 success=True 但 reason 非空，表示出现非致命问题（例如原文件删除失败）。
    """
    reason: str | None = None

    # 提前保留路径，避免 db.delete 后访问关系属性
    abs_path = media.absolute_path if isinstance(media.absolute_path, str) else None
    thumb_path = _thumb_path_for_id(media.id)

    # 删除 DB 记录（包含 Tag 关联，依赖 ORM 级联）
    try:
        db.delete(media)
        db.flush()  # 先 flush，失败可回滚并上抛
    except Exception as e:  # pragma: no cover - 异常路径
        db.rollback()
        return False, f"db_delete_failed:{type(e).__name__}"

    # 缩略图文件（若存在）
    try:
        if thumb_path.exists():
            thumb_path.unlink()
    except Exception:
        # 非致命：保留 warning 理由
        reason = (reason or "") + " thumb_remove_failed"

    # 原文件
    if delete_file and abs_path:
        try:
            p = Path(abs_path)
            if p.exists():
                p.unlink()
        except Exception:
            # 非致命：记录 warning，DB 已删除，接口仍视为成功
            reason = (reason or "") + " file_remove_failed"

    return True, reason.strip() if reason else None


def batch_delete(
    db: Session, ids: Iterable[int], *, delete_file: bool = True
) -> Tuple[List[int], List[FailedItem]]:
    """批量删除，返回 (deleted_ids, failed_items)。

    约定：
    - 不存在的 id 视为已删除（幂等），计入 deleted。
    - DB 删除失败计入 failed；单个失败不影响其他项继续处理。
    - 原文件/缩略图删除失败不算 failed（DB 已删不可见），但客户端可根据需要扩展 warning 字段。
    """
    deleted: List[int] = []
    failed: List[FailedItem] = []

    # 为减少往返，先一次性取出存在的记录并做映射
    id_list = list({int(i) for i in ids})
    if not id_list:
        return deleted, failed

    existing = (
        db.query(Media)
        .filter(Media.id.in_(id_list))  # type: ignore[arg-type]
        .all()
    )
    exist_map = {m.id: m for m in existing}

    for mid in id_list:
        m = exist_map.get(mid)
        if not m:
            # 幂等：记录不存在视为已删
            deleted.append(mid)
            continue
        ok, reason = delete_media_record_and_files(db, m, delete_file=delete_file)
        if ok:
            deleted.append(mid)
        else:
            failed.append(FailedItem(id=mid, reason=reason or "unknown"))

    # 批量提交（若前面个别项回滚，该项已在 failed）
    try:
        db.commit()
    except Exception as e:  # pragma: no cover - 罕见
        db.rollback()
        # 保守处理：标记所有已标记为删除的 id 为失败
        failed.extend(FailedItem(id=i, reason=f"commit_failed:{type(e).__name__}") for i in deleted)
        deleted.clear()

    return deleted, failed


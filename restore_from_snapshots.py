#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
从仓库内的快照目录恢复数据（默认直接执行）。

行为（默认）：
- 删除根目录下：media_app.db、sample_media/、thumbnails/
- 从快照目录复制：<snapshots>/media_app.db -> ./media_app.db
                 <snapshots>/sample_media/ -> ./sample_media/

使用：
- 直接执行：uv run python restore_from_snapshots.py

说明：
- 为安全起见，脚本包含路径越界保护，仅在仓库根目录内操作。
"""

from __future__ import annotations
from pathlib import Path
import shutil
import sys


def human(p: Path) -> str:
    try:
        return str(p.relative_to(Path.cwd()))
    except Exception:
        return str(p)


def ensure_inside_repo(path: Path, repo_root: Path) -> None:
    try:
        path.resolve().relative_to(repo_root.resolve())
    except Exception:
        raise RuntimeError(f"路径越界保护触发：{path} 不在仓库根目录内")


def main() -> int:
    repo_root = Path(__file__).resolve().parent
    # 固定快照目录名：media_snapshots（无参数）
    snapshots_dir = (repo_root / "media_snapshots").resolve()

    db_src = snapshots_dir / "media_app.db"
    media_src = snapshots_dir / "sample_media"

    db_dest = repo_root / "media_app.db"
    media_dest = repo_root / "sample_media"
    thumbs_dir = repo_root / "thumbnails"

    # 安全：所有目标必须位于仓库内
    for p in (snapshots_dir, db_src, media_src, db_dest, media_dest, thumbs_dir):
        ensure_inside_repo(p, repo_root)

    # 校验快照目录结构
    errors = []
    if not snapshots_dir.exists():
        errors.append(f"快照目录不存在：{human(snapshots_dir)}")
    if not db_src.exists():
        errors.append(f"缺少文件：{human(db_src)}")
    if not media_src.exists() or not media_src.is_dir():
        errors.append(f"缺少目录：{human(media_src)}")
    if errors:
        print("❌ 无法恢复：")
        for e in errors:
            print(" -", e)
        return 2

    print("[restore] 将删除并恢复以下目标：")
    print(f"  - DB: {human(db_dest)}  <=  {human(db_src)}")
    print(f"  - 媒体目录: {human(media_dest)}  <=  {human(media_src)}")
    print(f"  - 清理缩略图: {human(thumbs_dir)}")

    # 删除现有目标
    try:
        if db_dest.exists():
            db_dest.unlink()
            print(f"[remove] 删除 {human(db_dest)}")
    except Exception as e:
        print(f"❌ 删除数据库失败: {human(db_dest)} -> {e}")
        return 3

    try:
        if media_dest.exists():
            shutil.rmtree(media_dest)
            print(f"[remove] 删除 {human(media_dest)}/")
    except Exception as e:
        print(f"❌ 删除媒体目录失败: {human(media_dest)} -> {e}")
        return 3

    if thumbs_dir.exists():
        try:
            shutil.rmtree(thumbs_dir)
            print(f"[remove] 删除 {human(thumbs_dir)}/")
        except Exception as e:
            print(f"⚠️ 清理缩略图失败（忽略）: {human(thumbs_dir)} -> {e}")

    # 复制快照
    try:
        shutil.copy2(db_src, db_dest)
        print(f"[copy] {human(db_src)} -> {human(db_dest)}")
    except Exception as e:
        print(f"❌ 复制数据库失败: {human(db_src)} -> {human(db_dest)} : {e}")
        return 4

    try:
        shutil.copytree(media_src, media_dest)
        print(f"[copy] {human(media_src)} -> {human(media_dest)}")
    except Exception as e:
        print(f"❌ 复制媒体目录失败: {human(media_src)} -> {human(media_dest)} : {e}")
        return 4

    print("✅ 恢复完成。可以启动后端或重新运行测试。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

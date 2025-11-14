#!/usr/bin/env python3
"""准备 API 测试所需的本地数据（不恢复数据库快照）。

步骤：
1. 删除仓库根目录下的 media_app.db、sample_media/、thumbnails/。
2. 从 media_snapshots/sample_media/ 复制新的 sample_media/ 样本。

运行方式：
    uv run python prepare_test_media.py

说明：
- 本脚本不会恢复 media_app.db，后端需在启动时自行创建数据库。
- 复制前会做简单的路径越界校验，确保仅操作当前仓库内的文件。
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path


def _human(path: Path, root: Path) -> str:
    try:
        return str(path.resolve().relative_to(root.resolve()))
    except Exception:
        return str(path)


def _ensure_inside_repo(path: Path, repo_root: Path) -> None:
    try:
        path.resolve().relative_to(repo_root.resolve())
    except Exception:
        raise RuntimeError(f"路径越界：{path} 不在仓库根目录 {repo_root} 内")


def _safe_remove(path: Path) -> None:
    if not path.exists():
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def main() -> int:
    repo_root = Path(__file__).resolve().parent
    snapshots_dir = repo_root / "media_snapshots"
    sample_src = snapshots_dir / "sample_media"
    db_dest = repo_root / "media_app.db"
    sample_dest = repo_root / "sample_media"
    thumbs_dest = repo_root / "thumbnails"

    for path in (snapshots_dir, sample_src, db_dest, sample_dest, thumbs_dest):
        _ensure_inside_repo(path, repo_root)

    if not sample_src.exists() or not sample_src.is_dir():
        print(f"❌ 缺少样本目录：{_human(sample_src, repo_root)}")
        return 2

    print("[prepare] 将执行以下操作：")
    print(f"  - 删除 {_human(db_dest, repo_root)}（若存在）")
    print(f"  - 删除 {_human(sample_dest, repo_root)}/（若存在）")
    print(f"  - 删除 {_human(thumbs_dest, repo_root)}/（若存在）")
    print(f"  - 复制 {_human(sample_src, repo_root)} -> {_human(sample_dest, repo_root)}")

    # 删除旧文件
    try:
        _safe_remove(db_dest)
        print(f"[remove] {_human(db_dest, repo_root)}")
    except Exception as exc:
        print(f"❌ 删除数据库失败：{exc}")
        return 3

    try:
        _safe_remove(sample_dest)
        print(f"[remove] {_human(sample_dest, repo_root)}/")
    except Exception as exc:
        print(f"❌ 删除 sample_media 失败：{exc}")
        return 3

    try:
        _safe_remove(thumbs_dest)
        print(f"[remove] {_human(thumbs_dest, repo_root)}/")
    except Exception as exc:
        print(f"⚠️ 删除 thumbnails 失败（忽略）：{exc}")

    # 恢复 sample_media
    try:
        shutil.copytree(sample_src, sample_dest)
        print(f"[copy] {_human(sample_src, repo_root)} -> {_human(sample_dest, repo_root)}")
    except Exception as exc:
        print(f"❌ 复制 sample_media 失败：{exc}")
        return 4

    print("✅ 测试数据准备完成。请启动后端后再运行 api_flow_test.py。")
    return 0


if __name__ == "__main__":
    sys.exit(main())

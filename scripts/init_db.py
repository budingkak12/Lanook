"""Media index bootstrap CLI."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from app.db import (
    MEDIA_ROOT_KEY,
    SessionLocal,
    clear_media_library,
    create_database_and_tables,
    scan_and_populate_media,
    seed_initial_data,
    set_setting,
)

DEFAULT_MEDIA_DIRECTORY = "./sample_media"


def _resolve_media_path(candidate: str | None) -> Path:
    base = candidate or os.environ.get("MEDIA_DIRECTORY_TO_SCAN") or DEFAULT_MEDIA_DIRECTORY
    return Path(base).expanduser().resolve()


def main() -> None:
    parser = argparse.ArgumentParser(description="初始化媒体数据库并导入指定目录。")
    parser.add_argument(
        "--media-path",
        type=str,
        default=None,
        help="要扫描的媒体目录（绝对路径）。未提供时使用 MEDIA_DIRECTORY_TO_SCAN 或示例 sample_media。",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="仅导入指定数量的新媒体，以便快速预热。默认导入全部。",
    )
    parser.add_argument(
        "--keep-existing",
        action="store_true",
        help="保留数据库中已有的媒体记录，而不是清空后重建。",
    )
    args = parser.parse_args()

    media_root = _resolve_media_path(args.media_path)

    print("--- 媒体数据库初始化 ---")
    print(f"媒体目录: {media_root}")

    create_database_and_tables()
    session = SessionLocal()
    new_count = 0
    try:
        seed_initial_data(session)
        set_setting(session, MEDIA_ROOT_KEY, str(media_root))

        if not args.keep_existing:
            clear_media_library(session)

        new_count = scan_and_populate_media(session, str(media_root), limit=args.limit)
        session.commit()
    finally:
        session.close()

    print(f"✅ 初始化完成，新导入 {new_count} 个媒体文件。")


if __name__ == "__main__":
    main()

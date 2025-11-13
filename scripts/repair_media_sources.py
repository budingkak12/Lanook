"""轻量脚本：为 media_sources 表补齐新引入的配置字段。"""
from __future__ import annotations

from app.db.bootstrap import create_database_and_tables, repair_media_sources_metadata, SessionLocal
from app.db.models_extra import MediaSource


def main() -> None:
    create_database_and_tables(echo=False)
    repair_media_sources_metadata()

    session = SessionLocal()
    try:
        total = session.query(MediaSource).count()
        print(f"✅ 数据修复完成，当前媒体来源共 {total} 条。")
    finally:
        session.close()


if __name__ == "__main__":
    main()

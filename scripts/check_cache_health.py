from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta
from pathlib import Path


DB_PATH = Path(__file__).resolve().parents[1] / "media_app.db"


def _parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None


def main() -> None:
    if not DB_PATH.exists():
        print(f"❌ 未找到数据库文件: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()
        table_exists = cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='media_cache_state'"
        ).fetchone()
        if not table_exists:
            print("⚠️  当前数据库尚未创建 media_cache_state 表，请先重建或执行初始化。")
            return

        total_media = cur.execute("SELECT COUNT(*) AS c FROM media").fetchone()["c"]
        cache_row = cur.execute(
            "SELECT COUNT(*) AS total_cache, SUM(hit_count > 0) AS hot_rows FROM media_cache_state"
        ).fetchone()

        total_cache = cache_row["total_cache"] or 0
        hot_rows = cache_row["hot_rows"] or 0

        threshold = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        recent = cur.execute(
            "SELECT COUNT(*) AS fresh FROM media_cache_state WHERE updated_at >= ?",
            (threshold,),
        ).fetchone()["fresh"]

        print("📊 Media Cache Health")
        print(f"- 数据库路径        : {DB_PATH}")
        print(f"- 媒体总量          : {total_media}")
        print(f"- 缓存记录          : {total_cache}")
        ratio = (total_cache / total_media * 100) if total_media else 0
        print(f"- 缓存覆盖率        : {ratio:.2f}%")
        print(f"- 命中(>0 hits)     : {hot_rows}")
        print(f"- 24h 内更新         : {recent}")

        top_rows = cur.execute(
            """
            SELECT media_id, hit_count, hot_score, updated_at
            FROM media_cache_state
            ORDER BY hot_score DESC, hit_count DESC
            LIMIT 5
            """
        ).fetchall()
        if top_rows:
            print("- Top 热门条目:")
            for row in top_rows:
                updated = _parse_ts(row["updated_at"])
                updated_str = updated.isoformat() if updated else "-"
                print(
                    f"    · id={row['media_id']:<4} hits={row['hit_count']:<4} score={row['hot_score']:<4} updated={updated_str}"
                )
        else:
            print("- Top 热门条目: (empty)")
    finally:
        conn.close()


if __name__ == "__main__":
    main()

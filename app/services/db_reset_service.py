from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.engine import make_url

from app.db import SessionLocal, create_database_and_tables, seed_initial_data
from app.db.base import DATABASE_URL, engine


@dataclass
class DbResetResult:
    db_path: Path
    deleted: bool
    recreated: bool


def _cleanup_sqlite_sidecars(db_path: Path) -> None:
    for suffix in ("-shm", "-wal"):
        sidecar = db_path.parent / f"{db_path.name}{suffix}"
        if sidecar.exists():
            sidecar.unlink(missing_ok=True)


def resolve_db_file() -> Path:
    url = make_url(DATABASE_URL)
    if url.drivername != "sqlite":
        raise RuntimeError("DB reset 仅支持 SQLite 存储。")
    if not url.database:
        raise RuntimeError("SQLite 数据库路径为空。")
    db_path = Path(url.database)
    if not db_path.is_absolute():
        db_path = db_path.expanduser().resolve()
    return db_path


def reset_database_file(*, drop_existing: bool = True) -> DbResetResult:
    """删除并重建 SQLite 数据库文件，返回操作结果。"""

    engine.dispose()
    db_path = resolve_db_file()
    deleted = False

    if drop_existing and db_path.exists():
        db_path.unlink()
        deleted = True
        _cleanup_sqlite_sidecars(db_path)

    db_path.parent.mkdir(parents=True, exist_ok=True)
    create_database_and_tables(echo=False)

    session = SessionLocal()
    try:
        seed_initial_data(session)
        session.commit()
    finally:
        session.close()

    return DbResetResult(db_path=db_path, deleted=deleted, recreated=True)

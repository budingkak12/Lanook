import hashlib
import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.api.upload_routes import get_upload_service  # noqa: E402
from app.services.upload_service import UploadService, _sha256_file  # noqa: E402
from main import app  # noqa: E402


@pytest.fixture()
def tmp_incoming_dir(tmp_path, monkeypatch):
    incoming = tmp_path / "incoming" / "mobile"
    tmp_upload = tmp_path / ".tmp_uploads"
    monkeypatch.setenv("MEDIA_APP_INCOMING_DIR", str(incoming))
    return incoming, tmp_upload


@pytest.fixture()
def client(tmp_incoming_dir):
    incoming, tmp_upload = tmp_incoming_dir
    service = UploadService(incoming_dir=incoming, tmp_root=tmp_upload)
    app.dependency_overrides[get_upload_service] = lambda: service
    yield TestClient(app)
    app.dependency_overrides.pop(get_upload_service, None)


def test_upload_whole_flow(client, tmp_incoming_dir):
    incoming_dir, _ = tmp_incoming_dir
    data = b"hello world"
    chunk_size = 6
    total_size = len(data)
    checksum = hashlib.sha256(data).hexdigest()

    # init
    resp = client.post(
        "/upload/init",
        json={
            "filename": "greeting.txt",
            "total_size": total_size,
            "chunk_size": chunk_size,
            "checksum": checksum,
            "device_id": "deviceA",
        },
    )
    assert resp.status_code == 200
    upload_id = resp.json()["upload_id"]

    # upload two chunks
    resp = client.post(
        "/upload/chunk",
        data={"upload_id": upload_id, "index": 0},
        files={"file": ("chunk0", data[:chunk_size], "application/octet-stream")},
    )
    assert resp.status_code == 204

    resp = client.post(
        "/upload/chunk",
        data={"upload_id": upload_id, "index": 1},
        files={"file": ("chunk1", data[chunk_size:], "application/octet-stream")},
    )
    assert resp.status_code == 204

    # status check
    status_resp = client.get(f"/upload/{upload_id}")
    assert status_resp.status_code == 200
    assert sorted(status_resp.json()["received_chunks"]) == [0, 1]

    # finish
    resp = client.post(
        "/upload/finish",
        json={
            "upload_id": upload_id,
            "total_chunks": 2,
            "checksum": checksum,
            "skip_scan": True,
        },
    )
    assert resp.status_code == 200
    final_path = Path(resp.json()["path"])
    assert final_path.exists()
    assert final_path.read_bytes() == data

    # checksum helper sanity
    assert _sha256_file(final_path) == checksum

    # final path located in device/date folder
    assert incoming_dir in final_path.parents


def test_finish_triggers_scan(monkeypatch, client, tmp_incoming_dir):
    calls = {}

    def fake_scan(db, root_path: str, limit=None, source_id=None):
        calls["root"] = root_path
        calls["limit"] = limit
        return 1

    monkeypatch.setattr("app.services.upload_service.scan_source_once", fake_scan)

    incoming_dir, _ = tmp_incoming_dir
    data = b"xyz"
    resp = client.post(
        "/upload/init",
        json={"filename": "b.txt", "total_size": len(data), "chunk_size": len(data)},
    )
    upload_id = resp.json()["upload_id"]
    client.post(
        "/upload/chunk",
        data={"upload_id": upload_id, "index": 0},
        files={"file": ("chunk0", data, "application/octet-stream")},
    )
    resp = client.post(
        "/upload/finish",
        json={"upload_id": upload_id, "total_chunks": 1, "skip_scan": False},
    )
    assert resp.status_code == 200
    assert calls["limit"] == 1
    assert incoming_dir in Path(calls["root"]).parents or Path(calls["root"]) == incoming_dir


def test_chunk_after_finish_returns_409(client):
    data = b"zzz"
    resp = client.post(
        "/upload/init",
        json={"filename": "c.bin", "total_size": len(data), "chunk_size": len(data)},
    )
    upload_id = resp.json()["upload_id"]
    client.post(
        "/upload/chunk",
        data={"upload_id": upload_id, "index": 0},
        files={"file": ("chunk0", data, "application/octet-stream")},
    )
    client.post("/upload/finish", json={"upload_id": upload_id, "total_chunks": 1})
    resp = client.post(
        "/upload/chunk",
        data={"upload_id": upload_id, "index": 1},
        files={"file": ("chunk1", b"more", "application/octet-stream")},
    )
    assert resp.status_code == 409


def test_cleanup_expired_sessions(tmp_incoming_dir, monkeypatch):
    from datetime import datetime, timedelta, timezone
    import json

    incoming, tmp_upload = tmp_incoming_dir
    service = UploadService(incoming_dir=incoming, tmp_root=tmp_upload)

    session_dir = tmp_upload / "u1"
    session_dir.mkdir(parents=True)
    meta = {
        "upload_id": "u1",
        "filename": "old.bin",
        "total_size": 1,
        "chunk_size": 1,
        "checksum": None,
        "device_id": "dev",
        "mime_type": None,
        "finished": True,
        "state": "finished",
        "finished_at": (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat(),
    }
    (session_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    (session_dir / "chunk_0").write_bytes(b"x")
    old_ts = (datetime.now() - timedelta(hours=48)).timestamp()
    os.utime(session_dir, (old_ts, old_ts))

    removed = service.cleanup_expired_sessions(ttl_hours=1)
    assert removed == 1
    assert not session_dir.exists()


def test_duplicate_finish_returns_409(client):
    data = b"abc123"
    resp = client.post(
        "/upload/init",
        json={"filename": "a.bin", "total_size": len(data), "chunk_size": len(data)},
    )
    upload_id = resp.json()["upload_id"]
    client.post(
        "/upload/chunk",
        data={"upload_id": upload_id, "index": 0},
        files={"file": ("chunk0", data, "application/octet-stream")},
    )
    finish_body = {"upload_id": upload_id, "total_chunks": 1, "skip_scan": True}
    first = client.post("/upload/finish", json=finish_body)
    assert first.status_code == 200
    second = client.post("/upload/finish", json=finish_body)
    assert second.status_code == 409

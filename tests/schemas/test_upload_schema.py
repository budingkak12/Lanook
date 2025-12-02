import sys
from pathlib import Path

# 允许直接运行 pytest 时找到 app 包
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.schemas.upload import (  # noqa: E402
    ChunkRequest,
    ChunkStatusResponse,
    FinishRequest,
    InitUploadRequest,
    InitUploadResponse,
    UploadErrorCode,
)


def test_init_request_defaults():
    req = InitUploadRequest(filename="a.jpg", total_size=10, chunk_size=4)
    assert req.checksum is None
    assert req.device_id is None
    assert req.mime_type is None
    assert req.relative_path is None
    assert req.modified_at is None


def test_init_response_defaults():
    resp = InitUploadResponse(upload_id="u1", chunk_size=4)
    assert resp.existed is False
    assert resp.received_chunks == []


def test_chunk_request_validation():
    chunk = ChunkRequest(upload_id="u1", index=0)
    assert chunk.index == 0
    assert chunk.checksum is None


def test_finish_request_flags():
    finish = FinishRequest(upload_id="u1", total_chunks=3)
    assert finish.skip_scan is False
    assert finish.checksum is None


def test_error_codes_unique():
    values = {c.value for c in UploadErrorCode}
    assert len(values) == len(UploadErrorCode)


def test_chunk_status_response_defaults():
    status = ChunkStatusResponse(upload_id="u1")
    assert status.received_chunks == []
    assert status.total_size is None
    assert status.chunk_size is None

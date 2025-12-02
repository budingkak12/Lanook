"""清理上传临时分块目录的脚本。

用法：
    uv run python -m scripts.cleanup_upload_tmp --ttl-hours 24
"""

from __future__ import annotations

import argparse

from app.services.upload_service import UploadService


def main():
    parser = argparse.ArgumentParser(description="清理过期的上传分块/会话临时目录")
    parser.add_argument("--ttl-hours", type=int, default=24, help="保留未完成会话的时间，默认 24 小时")
    args = parser.parse_args()

    service = UploadService()
    removed = service.cleanup_expired_sessions(ttl_hours=args.ttl_hours)
    print(f"cleaned {removed} expired sessions under {service.tmp_root}")


if __name__ == "__main__":
    main()

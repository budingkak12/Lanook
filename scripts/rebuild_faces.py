"""Quick CLI to rebuild face clusters from a directory.

Usage:
    uv run python -m scripts.rebuild_faces --base 测试图片 --threshold 0.55
"""

from __future__ import annotations

import argparse

from app.db import SessionLocal, create_database_and_tables
from app.services import face_cluster_service


def main():
    parser = argparse.ArgumentParser(description="Rebuild face clusters from a directory")
    parser.add_argument("--base", dest="base_path", default="测试图片", help="根目录，默认使用项目下的 '测试图片'")
    parser.add_argument("--threshold", dest="threshold", type=float, default=0.55, help="余弦相似度阈值")

    args = parser.parse_args()

    create_database_and_tables(echo=False)
    db = SessionLocal()
    try:
        media_count, face_count, cluster_count, path = face_cluster_service.rebuild_clusters(
            db,
            base_path=args.base_path,
            similarity_threshold=args.threshold,
        )
        print(
            f"完成。目录: {path}, 媒体 {media_count} 张, 人脸 {face_count} 个, 聚类 {cluster_count} 个, 阈值 {args.threshold}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()

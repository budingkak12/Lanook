"""重新生成 CLIP/SigLIP 向量并写入 Faiss 索引。

使用示例：
    uv run python -m scripts.clip_rebuild --base 测试图片 --model siglip --batch-size 8
"""

from __future__ import annotations

import argparse

from app.db import SessionLocal, create_database_and_tables
from app.services import clip_service


def main() -> None:
    parser = argparse.ArgumentParser(description="重建 CLIP/SigLIP 向量索引")
    parser.add_argument("--base", dest="base_path", default="测试图片", help="媒体根目录（仅用于路径校验）")
    parser.add_argument("--model", dest="model", default="siglip", help="模型别名或全名，默认 siglip")
    parser.add_argument("--batch-size", dest="batch_size", type=int, default=8, help="编码批大小")
    parser.add_argument("--limit", dest="limit", type=int, default=None, help="仅处理前 N 个媒体")
    args = parser.parse_args()

    create_database_and_tables(echo=False)
    session = SessionLocal()
    try:
        stats = clip_service.rebuild_embeddings(
            session,
            base_path=args.base_path,
            model_name=args.model,
            batch_size=args.batch_size,
            limit=args.limit,
        )
        print(
            f"完成向量重建：模型={stats['model']}, 写入 {stats['processed']} 条，跳过 {stats['skipped']} 条，当前总量 {stats['total_embeddings']}，索引 {stats['index_path']}"
        )
    finally:
        session.close()


if __name__ == "__main__":
    main()

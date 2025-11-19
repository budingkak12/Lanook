"""使用 wd-vit-tagger-v3 重新生成标签白名单。

示例：
    uv run python -m scripts.wd_tag_rebuild --base 测试图片 --model wd-v3 --min-conf 0.4
"""

from __future__ import annotations

import argparse

from app.db import SessionLocal, create_database_and_tables
from app.services import wd_tag_service


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="重建 wd-vit 标签")
    parser.add_argument("--base", dest="base_path", default="测试图片", help="仅允许处理该目录下媒体")
    parser.add_argument("--model", dest="model", default=None, help="模型别名或仓库 ID，默认 wd-v3")
    parser.add_argument("--batch-size", dest="batch_size", type=int, default=6, help="一次送入模型的图片数")
    parser.add_argument("--limit", dest="limit", type=int, default=None, help="限制处理的媒体数量")
    parser.add_argument("--min-conf", dest="min_conf", type=float, default=None, help="置信度阈值，默认0.35")
    parser.add_argument("--max-tags", dest="max_tags", type=int, default=None, help="每张保留的标签数，默认24")
    parser.add_argument(
        "--whitelist",
        dest="whitelist",
        default=None,
        help="白名单文件路径，默认 app/data/wdtag-whitelist.txt",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    create_database_and_tables(echo=False)
    session = SessionLocal()
    try:
        stats = wd_tag_service.rebuild_tags(
            session,
            base_path=args.base_path,
            model_name=args.model,
            batch_size=max(args.batch_size, 1),
            limit=args.limit,
            whitelist_path=args.whitelist,
            min_confidence=args.min_conf,
            max_tags_per_media=args.max_tags,
        )
        print(
            "完成标签重建: 模型={model}, 处理={processed_media}, 成功打标={tagged_media}, "
            "跳过={skipped_media}, 标签总数={total_tag_rows}, 唯一标签={unique_tags}, 用时={duration_seconds}s".format(**stats)
        )
    finally:
        session.close()


if __name__ == "__main__":
    main()

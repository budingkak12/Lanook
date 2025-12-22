import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db import SessionLocal  # noqa: E402
from app.db.bootstrap import create_database_and_tables  # noqa: E402
from app.db.models import FaceCluster, FaceEmbedding, Media, MediaTag, TagDefinition  # noqa: E402
from app.db.models_extra import AssetArtifact, ClipEmbedding, FaceProcessingState, MediaCacheState  # noqa: E402
from app.services.deletion_service import delete_media_record_and_files  # noqa: E402
from app.services.fs_service import compute_fingerprint  # noqa: E402
from app.services.asset_handlers.common import ARTIFACTS_ROOT  # noqa: E402


@pytest.mark.parametrize("delete_file", [True])
def test_hard_delete_media_cascades_and_cleans_files(tmp_path: Path, delete_file: bool):
    create_database_and_tables(echo=False)

    # 1) 准备一份本地“原文件”
    src = tmp_path / "media_to_delete.jpg"
    src.write_bytes(b"delete-me-" + os.urandom(16))

    with SessionLocal() as db:
        media = Media(
            filename=src.name,
            absolute_path=str(src),
            media_type="image",
        )
        db.add(media)
        db.commit()
        db.refresh(media)

        # tags（应级联删除）
        if db.query(TagDefinition).filter(TagDefinition.name == "like").first() is None:
            db.add(TagDefinition(name="like"))
            db.commit()
        db.add(MediaTag(media_id=media.id, tag_name="like"))

        # cache state（应删除）
        db.add(MediaCacheState(media_id=media.id))

        # clip embedding（应删除）
        db.add(
            ClipEmbedding(
                media_id=media.id,
                model="test-model",
                vector=b"\x00" * 8,
                dim=2,
            )
        )

        # face cluster + face embedding（删除 media 时 embedding 会被级联删，同时要把 cluster 的 representative_* 清空）
        cluster = FaceCluster(label="test", description="delete-test")
        db.add(cluster)
        db.commit()
        db.refresh(cluster)

        face = FaceEmbedding(
            media_id=media.id,
            face_index=0,
            embedding=b"\x01" * 16,
            embedding_dim=4,
            cluster_id=cluster.id,
        )
        db.add(face)
        db.commit()
        db.refresh(face)

        cluster.representative_media_id = media.id
        cluster.representative_face_id = face.id
        db.add(cluster)

        # face processing state（应删除）
        db.add(FaceProcessingState(media_id=media.id, status="done", face_count=1))

        db.commit()

        # 2) 准备派生文件：thumbnail + artifacts（metadata/transcodes/placeholders）
        fp = compute_fingerprint(src)
        thumb_path = Path(__file__).resolve().parents[2] / "thumbnails" / "fs" / fp[:2] / f"{fp}.jpg"
        thumb_path.parent.mkdir(parents=True, exist_ok=True)
        thumb_path.write_bytes(b"thumb")

        meta_path = ARTIFACTS_ROOT / "metadata" / f"{media.id}.json"
        meta_path.parent.mkdir(parents=True, exist_ok=True)
        meta_path.write_text('{"mediaId": %d}' % media.id, encoding="utf-8")

        transcode_path = ARTIFACTS_ROOT / "transcodes" / f"{media.id}.mp4"
        transcode_path.parent.mkdir(parents=True, exist_ok=True)
        transcode_path.write_bytes(b"proxy")

        placeholder_path = ARTIFACTS_ROOT / "placeholders" / f"{media.id}.jpg"
        placeholder_path.parent.mkdir(parents=True, exist_ok=True)
        placeholder_path.write_bytes(b"placeholder")

        # asset_artifact 行（应删除；file_path 指向的文件也应尽力清理）
        db.add(
            AssetArtifact(
                media_id=media.id,
                artifact_type="metadata",
                status="ready",
                file_path=str(meta_path),
            )
        )
        db.commit()

        assert src.exists()
        assert thumb_path.exists()
        assert meta_path.exists()
        assert transcode_path.exists()
        assert placeholder_path.exists()

        # 3) 硬删除
        ok, reason = delete_media_record_and_files(db, media, delete_file=delete_file)
        assert ok, reason
        db.commit()

        # 4) DB 断言：media 与关联都消失；cluster 仍在，但代表指针应被清空
        assert db.query(Media).filter(Media.id == media.id).first() is None
        assert db.query(MediaTag).filter(MediaTag.media_id == media.id).count() == 0
        assert db.query(FaceEmbedding).filter(FaceEmbedding.media_id == media.id).count() == 0
        assert db.query(ClipEmbedding).filter(ClipEmbedding.media_id == media.id).count() == 0
        assert db.query(FaceProcessingState).filter(FaceProcessingState.media_id == media.id).count() == 0
        assert db.query(MediaCacheState).filter(MediaCacheState.media_id == media.id).count() == 0
        assert db.query(AssetArtifact).filter(AssetArtifact.media_id == media.id).count() == 0

        refreshed_cluster = db.query(FaceCluster).filter(FaceCluster.id == cluster.id).first()
        assert refreshed_cluster is not None
        assert refreshed_cluster.representative_media_id is None
        assert refreshed_cluster.representative_face_id is None

        # 清理 cluster，避免污染本地库（测试媒体本身已删）
        db.query(FaceCluster).filter(FaceCluster.id == cluster.id).delete(synchronize_session=False)
        db.commit()

    # 5) 文件断言：原文件与派生物被删除
    assert not src.exists()
    assert not thumb_path.exists()
    assert not meta_path.exists()
    assert not transcode_path.exists()
    assert not placeholder_path.exists()

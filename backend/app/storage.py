import io
from pathlib import Path

from app.config import settings

# "minio" in docker/prod; "local" stores objects under LOCAL_STORAGE_DIR so the
# API can run on a dev machine without a MinIO server.
_local_root = Path(settings.local_storage_dir)
_client = None

if settings.storage_backend == "minio":
    from minio import Minio

    _client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def init_bucket() -> None:
    if _client is None:
        (_local_root / settings.minio_bucket).mkdir(parents=True, exist_ok=True)
        return
    if not _client.bucket_exists(settings.minio_bucket):
        _client.make_bucket(settings.minio_bucket)


def put_file(object_key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
    if _client is None:
        path = _local_root / settings.minio_bucket / object_key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return
    _client.put_object(
        settings.minio_bucket,
        object_key,
        io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def get_file(object_key: str) -> bytes:
    if _client is None:
        return (_local_root / settings.minio_bucket / object_key).read_bytes()
    response = _client.get_object(settings.minio_bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()

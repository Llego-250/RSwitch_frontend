from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://rdip:rdip@postgres:5432/rdip"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 12

    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "rdip"
    minio_secret_key: str = "rdip-secret"
    minio_secure: bool = False
    minio_bucket: str = "rdip"

    # "minio" or "local" (filesystem under local_storage_dir, for dev without MinIO).
    storage_backend: str = "minio"
    local_storage_dir: str = "./storage"

    # Comma-separated list of origins allowed to call the API.
    cors_origins: str = "http://localhost:5173,http://localhost:5183"

    class Config:
        env_file = ".env"


settings = Settings()

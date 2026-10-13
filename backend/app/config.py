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

    # Outbound email only (SRS §16). With no smtp_host every message is still
    # recorded in the EmailOutbox table (status "Logged") so it can be audited
    # and demoed without a mail server.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = True
    email_from: str = "RDIP <no-reply@rswitch.rw>"
    # Frontend base URL used to build links in emails (reset, invitation).
    app_base_url: str = "http://localhost:5173"

    # Secret for encrypting integration credentials at rest (SRS §10.2, §17.2).
    # Falls back to a key derived from jwt_secret when empty.
    encryption_key: str = ""

    # API rate limiting (SRS §17.2): per authenticated user and per client IP.
    rate_limit_enabled: bool = True
    rate_limit_per_user: int = 100
    rate_limit_per_ip: int = 1000

    class Config:
        env_file = ".env"


settings = Settings()

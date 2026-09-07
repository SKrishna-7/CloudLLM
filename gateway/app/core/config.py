from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://split_user:split_password@localhost:5433/split_db"
    REDIS_URL: str = "redis://localhost:6380/0"
    MINIO_URL: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    CLERK_JWKS_URL: str = "https://beloved-humpback-2376.clerk.accounts.dev/.well-known/jwks.json"
    WEBHOOK_SECRET: str = "super_secret_webhook_key_for_local_dev"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()

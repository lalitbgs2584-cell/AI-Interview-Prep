import os
from dotenv import load_dotenv
load_dotenv()

def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if value is None or value == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value

def _optional_env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)

class Settings:
    VALKEY_HOST: str = _required_env("VALKEY_HOST")
    VALKEY_PORT: int = int(_required_env("VALKEY_PORT"))
    BACKEND_URL: str = _required_env("BACKEND_URL")
    AWS_REGION: str = _required_env("AWS_REGION")
    S3_BUCKET: str = _required_env("AWS_S3_BUCKET_NAME")
    OPENAI_API_KEY: str = _required_env("OPENAI_API_KEY")
    CDN_BASE_URL : str = _optional_env("CDN_BASE_URL")
    NEO4J_URI : str = _required_env("NEO4J_URI")
    NEO4J_USERNAME : str = _required_env("NEO4J_USERNAME")
    NEO4J_PASSWORD : str = _required_env("NEO4J_PASSWORD")
    QDRANT_URI : str = _required_env("QDRANT_URI")
    QDRANT_API_KEY : str = _optional_env("QDRANT_API_KEY")
    QDRANT_ENV : str = _optional_env("QDRANT_ENV", "local")
    DATABASE_URL : str = _required_env("DATABASE_URL")
    TOKEN_DAILY_LIMIT: int = int(_required_env("TOKEN_DAILY_LIMIT"))

settings = Settings()

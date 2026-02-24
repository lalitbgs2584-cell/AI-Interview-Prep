import os
from dotenv import load_dotenv
load_dotenv()

class Settings:
    VALKEY_HOST: str = os.getenv("VALKEY_HOST")
    VALKEY_PORT: int = int(os.getenv("VALKEY_PORT", 6379))
    BACKEND_URL: str = os.getenv("BACKEND_URL", "http://api:4000")
    AWS_REGION: str = os.getenv("AWS_REGION", "ap-south-1")
    S3_BUCKET: str = os.getenv("AWS_S3_BUCKET_NAME", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    CDN_BASE_URL : str = os.getenv("CDN_BASE_URL", "")

settings = Settings()
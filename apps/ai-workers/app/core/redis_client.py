import redis
import json
from config import settings
from s3_client import download_resume, read_resume

client = redis.Redis(
    host=settings.VALKEY_HOST,
    port=settings.VALKEY_PORT,
    decode_responses=True
)


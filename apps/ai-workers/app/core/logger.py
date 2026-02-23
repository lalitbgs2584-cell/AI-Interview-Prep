import redis
import os

redis_client = redis.Redis(
    host=os.getenv("VALKEY_HOST", "valkey"),
    port=6379,
    decode_responses=True
)
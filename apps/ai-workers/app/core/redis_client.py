import redis
import json
from config import settings

client = redis.Redis(
    host=settings.VALKEY_HOST,
    port=settings.VALKEY_PORT,
    decode_responses=True
)

def process_resume(job: dict):
    file_id = job['fileId']
    user_id = job['userId']
    s3_filename = job['S3fileName']

    print("Processing Job:")
    print("File ID:", file_id)
    print("User ID:", user_id)
    print("S3 File:", s3_filename)


def start_worker():
    print("Worker started. Waiting for jobs...")

    while True:
        _, job_data = client.brpop("process_resume")
        job = json.loads(job_data)
        process_resume(job)
    

if __name__ == "__main__":
    start_worker()
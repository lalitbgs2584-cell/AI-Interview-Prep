import json
from app.core.s3_client import read_resume
from app.core.redis_client import client


def process_resume(job: dict):
    file_id = job['fileId']
    user_id = job['userId']
    s3_filename = job['S3fileName']
    
    print("==========================")
    print("Processing Job:")
    print("File ID:", file_id)
    print("User ID:", user_id)
    print("S3 File:", s3_filename)
    print("==========================")
    
    resume = read_resume(key=s3_filename)
    print(resume)


def start_worker():
    print("Worker started. Waiting for jobs...")

    while True:
        _, job_data = client.brpop("process_resume")
        job = json.loads(job_data)

        try:
            process_resume(job)
        except Exception as e:
            print(f"Job failed: {e}")
            
            job['error'] = str(e)
            job['retries'] = job.get('retries', 0) + 1

            if job['retries'] <= 3:
                print(f"Retrying job (attempt {job['retries']})...")
                client.lpush("process_resume", json.dumps(job))
            else:
                print("Max retries reached. Moving to dead letter queue.")
                client.lpush("process_resume:failed", json.dumps(job))



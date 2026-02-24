import boto3
from io import BytesIO

s3 = boto3.client('s3')

def download_resume(bucket: str, key: str) -> BytesIO:
    response = s3.get_object(Bucket=bucket, Key=key)
    return BytesIO(response['Body'].read())

# resume_bytes = download_resume('my-bucket', 'resumes/john_doe.pdf')
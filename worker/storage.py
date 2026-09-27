import os
import json
import boto3
from botocore.client import Config
from logger import get_logger

logger = get_logger(__name__)

def get_s3_client():
    # Helper to get env var case-insensitively
    def get_env_ci(key, default=None):
        for k, v in os.environ.items():
            if k.lower() == key.lower():
                return v
        return default

    endpoint_url = get_env_ci("S3_ENDPOINT_URL") or get_env_ci("MINIO_URL", "http://localhost:9000")
    access_key = get_env_ci("S3_ACCESS_KEY") or get_env_ci("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = get_env_ci("S3_SECRET_KEY") or get_env_ci("MINIO_SECRET_KEY", "minioadmin")
    region_name = get_env_ci("S3_REGION", "us-east-1")
    
    return boto3.client(
        's3',
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version='s3v4'),
        region_name=region_name
    )

def setup_s3_bucket():
    """Initializes the bucket if running locally. Fails silently in production."""
    def get_env_ci(key, default=None):
        for k, v in os.environ.items():
            if k.lower() == key.lower():
                return v
        return default

    client = get_s3_client()
    bucket_name = get_env_ci("S3_BUCKET_NAME", "images")
    try:
        client.head_bucket(Bucket=bucket_name)
    except Exception:
        try:
            logger.info(f"Bucket '{bucket_name}' not found, attempting to create it.")
            client.create_bucket(Bucket=bucket_name)
            
            # Apply public read policy for local MinIO
            policy = {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": "*",
                        "Action": ["s3:GetObject"],
                        "Resource": [f"arn:aws:s3:::{bucket_name}/*"]
                    }
                ]
            }
            client.put_bucket_policy(Bucket=bucket_name, Policy=json.dumps(policy))
        except Exception as e:
            logger.warning(f"Could not create bucket '{bucket_name}': {e}. Ensure it exists in production!")

# Only attempt to create bucket on boot if running locally
def get_env_ci_global(key, default=None):
    for k, v in os.environ.items():
        if k.lower() == key.lower():
            return v
    return default

if not get_env_ci_global("S3_ENDPOINT_URL"):
    setup_s3_bucket()

def upload_image_to_s3(image_bytes: bytes, job_id: str) -> str:
    """
    Uploads raw image bytes to S3 and returns the publicly accessible URL.
    """
    def get_env_ci(key, default=None):
        for k, v in os.environ.items():
            if k.lower() == key.lower():
                return v
        return default

    logger.info("Initializing S3 client upload", extra={"job_id": job_id})
    client = get_s3_client()
    bucket_name = get_env_ci("S3_BUCKET_NAME", "images")
    object_name = f"{job_id}.png"

    
    client.put_object(
        Bucket=bucket_name,
        Key=object_name,
        Body=image_bytes,
        ContentType='image/png'
    )
    
    external_url = get_env_ci("S3_EXTERNAL_URL") or get_env_ci("S3_ENDPOINT_URL") or get_env_ci("MINIO_EXTERNAL_URL") or get_env_ci("MINIO_URL", "http://localhost:9000")
    s3_url = f"{external_url}/{bucket_name}/{object_name}"
    
    logger.info("Successfully uploaded image to S3", extra={"job_id": job_id})
    return s3_url

import os
import json
import boto3
from botocore.client import Config
from app.core.logger import get_logger

logger = get_logger(__name__)

def get_s3_client():
    endpoint_url = os.getenv("S3_ENDPOINT_URL", os.getenv("MINIO_URL", "http://localhost:9000"))
    access_key = os.getenv("S3_ACCESS_KEY", os.getenv("MINIO_ACCESS_KEY", "minioadmin"))
    secret_key = os.getenv("S3_SECRET_KEY", os.getenv("MINIO_SECRET_KEY", "minioadmin"))
    region_name = os.getenv("S3_REGION", "us-east-1")
    
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
    client = get_s3_client()
    bucket_name = os.getenv("S3_BUCKET_NAME", "images")
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
if not os.getenv("S3_ENDPOINT_URL"):
    setup_s3_bucket()

def upload_image_to_s3(image_bytes: bytes, job_id: str) -> str:
    """
    Uploads raw image bytes to S3 and returns the publicly accessible URL.
    """
    logger.info("Initializing S3 client upload", extra={"job_id": job_id})
    client = get_s3_client()
    bucket_name = os.getenv("S3_BUCKET_NAME", "images")
    object_name = f"{job_id}.png"
    
    client.put_object(
        Bucket=bucket_name,
        Key=object_name,
        Body=image_bytes,
        ContentType='image/png'
    )
    
    external_url = os.getenv("S3_EXTERNAL_URL", os.getenv("MINIO_EXTERNAL_URL", os.getenv("MINIO_URL", "http://localhost:9000")))
    s3_url = f"{external_url}/{bucket_name}/{object_name}"
    
    logger.info("Successfully uploaded image to S3", extra={"job_id": job_id})
    return s3_url

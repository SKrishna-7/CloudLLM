import os
import json
import boto3
from botocore.client import Config
from logger import get_logger

logger = get_logger(__name__)

def get_minio_client():
    endpoint_url = os.getenv("MINIO_URL", "http://localhost:9000")
    access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    
    return boto3.client(
        's3',
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version='s3v4'),
        region_name='us-east-1'
    )

def upload_image_to_minio(image_bytes: bytes, job_id: str) -> str:
    """
    Uploads raw image bytes to MinIO and returns the publicly accessible URL.
    """
    logger.info("Initializing MinIO client upload", extra={"job_id": job_id})
    client = get_minio_client()
    bucket_name = "images"
    object_name = f"{job_id}.png"
    
    # Auto-create the bucket if it doesn't exist
    try:
        client.head_bucket(Bucket=bucket_name)
    except Exception:
        logger.info(f"Bucket '{bucket_name}' not found, creating it.", extra={"job_id": job_id})
        client.create_bucket(Bucket=bucket_name)
        
    # Ensure bucket is publicly readable
    try:
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
        logger.warning(f"Failed to set public bucket policy: {e}", extra={"job_id": job_id})
        
    client.put_object(
        Bucket=bucket_name,
        Key=object_name,
        Body=image_bytes,
        ContentType='image/png'
    )
    
    endpoint_url = os.getenv("MINIO_URL", "http://localhost:9000")
    minio_url = f"{endpoint_url}/{bucket_name}/{object_name}"
    
    logger.info("Successfully uploaded image to MinIO", extra={"job_id": job_id})
    return minio_url

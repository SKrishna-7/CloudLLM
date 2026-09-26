#!/bin/bash
# GCP GPU Worker Deployment Automation
# Provisions a Compute Engine instance with an attached L4 GPU and runs the Docker worker.

set -e

PROJECT_ID=$(gcloud config get-value project)
ZONE="us-central1-a"
INSTANCE_NAME="cloudllm-worker-1"
IMAGE="ghcr.io/yourusername/cloudllm-worker:latest"

echo "=================================================="
echo "🚀 Deploying GPU Worker to GCP Compute Engine"
echo "Project: $PROJECT_ID | Zone: $ZONE"
echo "=================================================="

# Check for required .env file to inject into the instance
if [ ! -f .env.gcp ]; then
    echo "❌ Error: .env.gcp file not found!"
    exit 1
fi

# Load variables safely to pass to the startup script
source .env.gcp

echo "Provisioning Compute Engine instance (L4 GPU, Spot Instance for cost savings)..."

gcloud compute instances create-with-container $INSTANCE_NAME \
    --project=$PROJECT_ID \
    --zone=$ZONE \
    --machine-type=g2-standard-4 \
    --accelerator=count=1,type=nvidia-l4 \
    --maintenance-policy=TERMINATE \
    --provisioning-model=SPOT \
    --image-family=cos-105-lts \
    --image-project=cos-cloud \
    --boot-disk-size=100GB \
    --container-image=$IMAGE \
    --container-env="REDIS_URL=$REDIS_URL,API_URL=$API_URL,WEBHOOK_SECRET=$WEBHOOK_SECRET,S3_ENDPOINT_URL=$S3_ENDPOINT_URL,S3_ACCESS_KEY=$S3_ACCESS_KEY,S3_SECRET_KEY=$S3_SECRET_KEY,S3_BUCKET_NAME=$S3_BUCKET_NAME,S3_REGION=$S3_REGION,HUGGINGFACE_TOKEN=$HUGGINGFACE_TOKEN" \
    --metadata="install-nvidia-driver=True"

echo "=================================================="
echo "✅ GPU Worker provisioned successfully!"
echo "The instance will automatically download the NVIDIA drivers, pull your Docker image from GHCR, and start processing jobs."
echo "=================================================="

#!/bin/bash
# Manual deployment script for Cloud Shell (reads from .env.gcp)

set -e

# Load environment variables from .env.gcp
export $(grep -v '^#' .env.gcp | xargs)

REGION="asia-south1"
VPC_NAME="default"

echo "=================================================="
echo "🚀 Deploying APIs to Cloud Run from Cloud Shell"
echo "=================================================="

# 1. Enable Required APIs (just in case)
echo "Enabling required APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com

# 2. Deploy Gateway
echo "Deploying Gateway to Cloud Run..."
gcloud run deploy cloudllm-gateway \
    --source ./gateway \
    --region $REGION \
    --network $VPC_NAME \
    --subnet default \
    --vpc-egress private-ranges-only \
    --allow-unauthenticated \
    --set-env-vars="DATABASE_URL=${DATABASE_URL},REDIS_URL=${REDIS_URL},S3_ENDPOINT_URL=${S3_ENDPOINT_URL},S3_ACCESS_KEY=${S3_ACCESS_KEY},S3_SECRET_KEY=${S3_SECRET_KEY},S3_BUCKET_NAME=${S3_BUCKET_NAME},S3_REGION=${S3_REGION}"

# 3. Deploy Scheduler
echo "Deploying Go Scheduler to Cloud Run..."
gcloud run deploy cloudllm-scheduler \
    --source ./scheduler \
    --region $REGION \
    --network $VPC_NAME \
    --subnet default \
    --vpc-egress private-ranges-only \
    --no-allow-unauthenticated \
    --no-cpu-throttling \
    --set-env-vars="DATABASE_URL=${DATABASE_URL},REDIS_URL=${REDIS_URL},S3_ENDPOINT_URL=${S3_ENDPOINT_URL},S3_ACCESS_KEY=${S3_ACCESS_KEY},S3_SECRET_KEY=${S3_SECRET_KEY},S3_BUCKET_NAME=${S3_BUCKET_NAME},S3_REGION=${S3_REGION}"

echo "=================================================="
echo "🎉 Deployment Complete!"
echo "=================================================="

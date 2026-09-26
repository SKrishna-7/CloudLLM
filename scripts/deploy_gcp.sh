#!/bin/bash
# GCP Core Infrastructure Deployment Automation (Cloud Run, Cloud SQL, Memorystore)
# Run this from the root of the CloudLLM repository.

set -e

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
DB_INSTANCE_NAME="cloudllm-db"
REDIS_INSTANCE_NAME="cloudllm-redis"
VPC_NAME="default"
CONNECTOR_NAME="cloudllm-vpc-cx"

echo "=================================================="
echo "🚀 Deploying CloudLLM Core Infrastructure to GCP"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "=================================================="

# 1. Enable Required APIs
echo "[1/6] Enabling required GCP APIs..."
gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    redis.googleapis.com \
    cloudbuild.googleapis.com

# 3. Provision Cloud SQL (PostgreSQL)
echo "[3/6] Provisioning Cloud SQL (PostgreSQL)..."
if ! gcloud sql instances describe $DB_INSTANCE_NAME >/dev/null 2>&1; then
    gcloud sql instances create $DB_INSTANCE_NAME \
        --database-version=POSTGRES_15 \
        --tier=db-f1-micro \
        --region=$REGION \
        --network=$VPC_NAME \
        --no-assign-ip

    # Set password for postgres user (Change this in production!)
    gcloud sql users set-password postgres \
        --instance=$DB_INSTANCE_NAME \
        --password="super_secure_password_123!"
        
    gcloud sql databases create cloudllm --instance=$DB_INSTANCE_NAME
else
    echo "Cloud SQL instance already exists. Skipping."
fi

# 4. Provision Memorystore (Redis)
echo "[4/6] Provisioning Memorystore (Redis)..."
if ! gcloud redis instances describe $REDIS_INSTANCE_NAME --region=$REGION >/dev/null 2>&1; then
    gcloud redis instances create $REDIS_INSTANCE_NAME \
        --size=1 \
        --region=$REGION \
        --network=$VPC_NAME \
        --redis-version=redis_7_0
else
    echo "Redis instance already exists. Skipping."
fi

# 5. Fetch Internal IPs to inject into Cloud Run
DB_IP=$(gcloud sql instances describe $DB_INSTANCE_NAME --format="value(ipAddresses[0].ipAddress)")
REDIS_IP=$(gcloud redis instances describe $REDIS_INSTANCE_NAME --region=$REGION --format="value(host)")

echo "✅ Database IP: $DB_IP"
echo "✅ Redis IP: $REDIS_IP"

# 6. Deploy to Cloud Run
echo "[5/6] Deploying Gateway to Cloud Run..."
gcloud run deploy cloudllm-gateway \
    --source ./gateway \
    --region $REGION \
    --network $VPC_NAME \
    --subnet default \
    --vpc-egress private-ranges-only \
    --allow-unauthenticated \
    --set-env-vars="DATABASE_URL=postgresql://postgres:super_secure_password_123!@${DB_IP}:5432/cloudllm,REDIS_URL=redis://${REDIS_IP}:6379"

echo "[6/6] Deploying Go Scheduler to Cloud Run..."
gcloud run deploy cloudllm-scheduler \
    --source ./scheduler \
    --region $REGION \
    --network $VPC_NAME \
    --subnet default \
    --vpc-egress private-ranges-only \
    --no-allow-unauthenticated \
    --no-cpu-throttling \
    --set-env-vars="DATABASE_URL=postgresql://postgres:super_secure_password_123!@${DB_IP}:5432/cloudllm,REDIS_URL=redis://${REDIS_IP}:6379"

echo "=================================================="
echo "🎉 GCP Core Infrastructure Deployment Complete!"
echo "Make sure to update your .env.gcp file with the Database and Redis IPs if you want to connect locally (via VPN/Bastion)."
echo "=================================================="

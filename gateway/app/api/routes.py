import uuid
import hmac
import hashlib
from fastapi import APIRouter, Depends, HTTPException, status, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import joinedload
import redis.asyncio as redis

from app.api.dependencies import get_db, get_redis, api_key_auth
from app.schemas.job import JobCreateRequest, JobResponse
from app.models.user import User, Job, JobStatus
from app.services.billing import deduct_credit
from app.services.queue import push_job_to_queue
from app.core.logger import get_logger
from app.core.limiter import limiter
from app.core.config import settings

logger = get_logger(__name__)
router = APIRouter()

@router.post("/v1/images/generate", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("10/minute")
async def generate_image(
    request: Request,
    job_request: JobCreateRequest,
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    job_id_str = str(uuid.uuid4())
    logger.info("Starting image generation request", extra={"job_id": job_id_str})
    
    # 1. Transactional Billing: Deduct 7 credits
    await deduct_credit(current_user, db, job_id=job_id_str)
    
    # 2. Create the Job record in 'queued' state
    new_job = Job(
        id=uuid.UUID(job_id_str),
        user_id=current_user.id,
        prompt=job_request.prompt,
        negative_prompt=job_request.negative_prompt,
        steps=job_request.steps,
        guidance_scale=job_request.guidance_scale,
        width=job_request.width,
        height=job_request.height,
        status=JobStatus.queued
    )
    db.add(new_job)
    await db.flush() 
    
    # 3. Publish to Redis queue
    try:
        await push_job_to_queue(new_job.id, job_request, redis_client)
        logger.info("Successfully pushed job to queue", extra={"job_id": job_id_str})
    except Exception as e:
        await db.rollback()
        logger.error(f"Queue service unavailable: {e}", extra={"job_id": job_id_str})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, 
            detail="Queue service unavailable, transaction rolled back."
        )
    
    await db.commit()
    await db.refresh(new_job)
    
    return JobResponse(job_id=new_job.id, prompt=new_job.prompt, status=new_job.status, created_at=new_job.created_at)

@router.get("/v1/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    job_id_str = str(job_id)
    query = select(Job).where(Job.id == job_id)
    result = await db.execute(query)
    job = result.scalar_one_or_none()
    
    if not job:
        logger.warning("Job not found", extra={"job_id": job_id_str})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
    logger.info("Fetched job status", extra={"job_id": job_id_str})
    return JobResponse(job_id=job.id, prompt=job.prompt, status=job.status, image_url=job.image_url, created_at=job.created_at)

@router.get("/v1/jobs", response_model=list[JobResponse])
async def list_jobs(
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db)
):
    query = select(Job).where(Job.user_id == current_user.id).order_by(Job.created_at.asc())
    result = await db.execute(query)
    jobs = result.scalars().all()
    
    return [
        JobResponse(
            job_id=job.id, 
            prompt=job.prompt, 
            status=job.status, 
            image_url=job.image_url, 
            created_at=job.created_at
        ) for job in jobs
    ]

from pydantic import BaseModel

class WebhookPayload(BaseModel):
    job_id: uuid.UUID
    status: JobStatus
    image_url: str | None = None

@router.post("/v1/jobs/webhook", status_code=status.HTTP_200_OK)
async def job_webhook(
    request: Request,
    payload: WebhookPayload,
    db: AsyncSession = Depends(get_db),
    x_webhook_signature: str = Header(None)
):
    if not x_webhook_signature:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing signature")
        
    body = await request.body()
    expected_sig = hmac.new(settings.WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    
    if not hmac.compare_digest(expected_sig, x_webhook_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid signature")

    job_id_str = str(payload.job_id)
    query = select(Job).options(joinedload(Job.user)).where(Job.id == payload.job_id)
    result = await db.execute(query)
    job = result.scalar_one_or_none()
    
    if not job:
        logger.warning("Webhook received for unknown job", extra={"job_id": job_id_str})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
    job.status = payload.status
    if payload.image_url:
        job.image_url = payload.image_url
        
    if payload.status == JobStatus.failed:
        job.user.credits_balance += 7
        logger.info("Refunded 7 credits for failed job", extra={"job_id": job_id_str})
        
    await db.commit()
    logger.info(f"Webhook updated job status to {payload.status.value}", extra={"job_id": job_id_str})
    return {"message": "Webhook processed successfully"}

from sqlalchemy import func

@router.get("/v1/admin/stats")
async def get_admin_stats(
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    # 1. Queue Depth
    queue_length = await redis_client.llen("image_queue")
    
    # 2. Active Workers
    clients = await redis_client.client_list()
    active_workers = sum(1 for client in clients if client.get("name") == "gpu_worker")
    
    # 3. Job Stats
    query = select(Job.status, func.count(Job.id)).group_by(Job.status)
    result = await db.execute(query)
    
    counts = {status.value: count for status, count in result.all()}
    
    return {
        "active_workers": active_workers,
        "queue_length": queue_length,
        "total_completed": counts.get("completed", 0),
        "total_failed": counts.get("failed", 0),
        "total_queued": counts.get("queued", 0),
        "total_processing": counts.get("processing", 0),
        "total_jobs": sum(counts.values())
    }

import secrets
import hashlib
from app.models.user import APIKey

class APIKeyResponse(BaseModel):
    id: uuid.UUID
    prefix: str
    
class APIKeyCreateResponse(APIKeyResponse):
    raw_key: str

@router.get("/v1/api-keys", response_model=list[APIKeyResponse])
async def get_api_keys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(api_key_auth)
):
    query = select(APIKey).where(APIKey.user_id == current_user.id)
    result = await db.execute(query)
    keys = result.scalars().all()
    return [APIKeyResponse(id=k.id, prefix=k.prefix) for k in keys]

@router.post("/v1/api-keys", response_model=APIKeyCreateResponse)
async def create_api_key(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(api_key_auth)
):
    # Generate a secure random string
    raw_secret = secrets.token_urlsafe(32)
    raw_key = f"sk_live_{raw_secret}"
    
    # Hash it for storage
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    prefix = raw_key[:12] + "..."
    
    new_key = APIKey(
        user_id=current_user.id,
        key_hash=key_hash,
        prefix=prefix
    )
    db.add(new_key)
    await db.commit()
    await db.refresh(new_key)
    
    return APIKeyCreateResponse(
        id=new_key.id,
        prefix=new_key.prefix,
        raw_key=raw_key
    )

@router.delete("/v1/api-keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(api_key_auth)
):
    query = select(APIKey).where(APIKey.id == key_id, APIKey.user_id == current_user.id)
    result = await db.execute(query)
    key = result.scalar_one_or_none()
    
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API Key not found")
        
    await db.delete(key)
    await db.commit()
    return None

class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    credits_balance: int

@router.get("/v1/users/me", response_model=UserResponse)
async def get_user_me(
    current_user: User = Depends(api_key_auth)
):
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        credits_balance=current_user.credits_balance
    )

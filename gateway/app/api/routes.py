import uuid
import hmac
import hashlib
from datetime import datetime, date, timedelta
from fastapi import APIRouter, Depends, Request, HTTPException, status, Form, UploadFile, File, Query, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload
import redis.asyncio as redis

from app.core.database import get_db
from app.api.dependencies import api_key_auth, get_redis
from app.models.user import User, Job, JobStatus, Chat
from app.schemas.job import JobCreateRequest, JobResponse
from app.schemas.chat import ChatResponse
from app.core.limiter import limiter
from app.services.storage import upload_image_to_s3
from app.services.billing import deduct_credit
from app.services.queue import push_job_to_queue
from app.core.logger import get_logger
from app.core.config import settings

logger = get_logger(__name__)
router = APIRouter()

@router.post("/v1/images/generate", response_model=JobResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("10/minute")
async def generate_image(
    request: Request,
    prompt: str = Form(..., min_length=3, max_length=2000),
    negative_prompt: str | None = Form(None, max_length=2000),
    steps: int = Form(35, ge=10, le=50),
    guidance_scale: float = Form(3.4, ge=1.0, le=20.0),
    width: int = Form(832, ge=512, le=1536),
    height: int = Form(1216, ge=512, le=1536),
    strength: float | None = Form(None, ge=0.0, le=1.0),
    chat_id: uuid.UUID | None = Form(None),
    init_image: UploadFile = File(None),
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    job_id_str = str(uuid.uuid4())
    logger.info("Starting image generation request", extra={"job_id": job_id_str})
    
    # 1. Transactional Billing: Deduct 7 credits
    await deduct_credit(current_user, db, job_id=job_id_str)
    
    init_image_url = None
    if init_image:
        image_bytes = await init_image.read()
        init_image_url = upload_image_to_s3(image_bytes, f"{job_id_str}_init")
        
    job_request = JobCreateRequest(
        prompt=prompt,
        negative_prompt=negative_prompt,
        steps=steps,
        guidance_scale=guidance_scale,
        width=width,
        height=height,
        strength=strength,
        init_image_url=init_image_url
    )
    
    # 1.5 Handle Chat Session
    if not chat_id:
        new_chat = Chat(
            user_id=current_user.id,
            title=prompt[:30] + "..." if len(prompt) > 30 else prompt
        )
        db.add(new_chat)
        await db.flush()
        chat_id = new_chat.id

    # 2. Create the Job record in 'queued' state
    new_job = Job(
        id=uuid.UUID(job_id_str),
        user_id=current_user.id,
        chat_id=chat_id,
        prompt=job_request.prompt,
        negative_prompt=job_request.negative_prompt,
        steps=job_request.steps,
        guidance_scale=job_request.guidance_scale,
        width=job_request.width,
        height=job_request.height,
        init_image_url=job_request.init_image_url,
        strength=job_request.strength,
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
    
    return JobResponse(job_id=new_job.id, prompt=new_job.prompt, status=new_job.status, created_at=new_job.created_at, completed_at=new_job.completed_at, chat_id=new_job.chat_id)

@router.get("/v1/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: uuid.UUID,
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db)
):
    job_id_str = str(job_id)
    # Only allow users to see their own jobs (or admins to see any)
    query = select(Job).where(Job.id == job_id)
    if current_user.role not in ["admin", "super_admin"]:
        query = query.where(Job.user_id == current_user.id)
    result = await db.execute(query)
    job = result.scalar_one_or_none()
    
    if not job:
        logger.warning("Job not found", extra={"job_id": job_id_str})
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
    logger.info("Fetched job status", extra={"job_id": job_id_str})
    
    queue_position = None
    if job.status == JobStatus.queued:
        pos_query = select(func.count(Job.id)).where(
            Job.status == JobStatus.queued,
            Job.created_at < job.created_at
        )
        pos_result = await db.execute(pos_query)
        queue_position = pos_result.scalar() + 1
        
    return JobResponse(
        job_id=job.id, 
        prompt=job.prompt, 
        status=job.status, 
        image_url=job.image_url, 
        created_at=job.created_at, 
        completed_at=job.completed_at,
        chat_id=job.chat_id,
        queue_position=queue_position
    )

@router.delete("/v1/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: uuid.UUID,
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db)
):
    job_id_str = str(job_id)
    query = select(Job).where(Job.id == job_id, Job.user_id == current_user.id)
    result = await db.execute(query)
    job = result.scalar_one_or_none()
    
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
    await db.delete(job)
    await db.commit()
    logger.info("Deleted job from history", extra={"job_id": job_id_str})
    return None


from fastapi import Query

@router.get("/v1/jobs", response_model=list[JobResponse])
async def list_jobs(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    source: str | None = Query(None),
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db)
):
    query = select(Job).where(Job.user_id == current_user.id)
    
    if source == "web":
        query = query.where(Job.chat_id.isnot(None))
    elif source == "api":
        query = query.where(Job.chat_id.is_(None))
        
    query = query.order_by(Job.created_at.desc()).limit(limit).offset(offset)
    
    result = await db.execute(query)
    jobs = result.scalars().all()
    
    responses = []
    for job in jobs:
        queue_position = None
        if job.status == JobStatus.queued:
            pos_query = select(func.count(Job.id)).where(
                Job.status == JobStatus.queued,
                Job.created_at < job.created_at
            )
            pos_result = await db.execute(pos_query)
            queue_position = pos_result.scalar() + 1
            
        responses.append(JobResponse(
            job_id=job.id, 
            prompt=job.prompt, 
            status=job.status, 
            image_url=job.image_url, 
            created_at=job.created_at,
            completed_at=job.completed_at,
            chat_id=job.chat_id,
            queue_position=queue_position
        ))
        
    return responses

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
        
    # Idempotency guard: only process if the job isn't already in the target state
    previous_status = job.status
    
    job.status = payload.status
    if payload.image_url:
        job.image_url = payload.image_url
        
    if payload.status in [JobStatus.completed, JobStatus.failed]:
        job.completed_at = datetime.utcnow()
        
    # Only refund credits if the job was NOT already failed (prevents replay attacks)
    if payload.status == JobStatus.failed and previous_status != JobStatus.failed:
        job.user.credits_balance += 7
        logger.info("Refunded 7 credits for failed job", extra={"job_id": job_id_str})
    elif payload.status == JobStatus.failed and previous_status == JobStatus.failed:
        logger.warning("Duplicate failed webhook received, skipping refund", extra={"job_id": job_id_str})
        
    await db.commit()
    logger.info(f"Webhook updated job status to {payload.status.value}", extra={"job_id": job_id_str})
    return {"message": "Webhook processed successfully"}




import secrets
import hashlib

from app.models.user import APIKey

class DailyActivity(BaseModel):
    date: str
    count: int

class UserStatsResponse(BaseModel):
    total_jobs: int
    completed_jobs: int
    failed_jobs: int
    processing_jobs: int
    credits_balance: int
    daily_activity: list[DailyActivity]

@router.get("/v1/users/me/stats", response_model=UserStatsResponse)
async def get_user_stats(
    source: str | None = Query(None),
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db)
):
    # Get status counts
    status_query = select(Job.status, func.count(Job.id)).where(Job.user_id == current_user.id)
    if source == "web":
        status_query = status_query.where(Job.chat_id.isnot(None))
    elif source == "api":
        status_query = status_query.where(Job.chat_id.is_(None))
    
    status_query = status_query.group_by(Job.status)
    status_result = await db.execute(status_query)
    counts = {status.value: count for status, count in status_result.all()}
    
    total = sum(counts.values())
    completed = counts.get(JobStatus.completed.value, 0)
    failed = counts.get(JobStatus.failed.value, 0)
    processing = counts.get(JobStatus.processing.value, 0)
    
    # Get daily activity for last 7 days
    seven_days_ago = date.today() - timedelta(days=6)
    
    # Cast created_at to date for grouping
    daily_query = (
        select(func.date(Job.created_at).label("day"), func.count(Job.id))
        .where(Job.user_id == current_user.id)
        .where(func.date(Job.created_at) >= seven_days_ago)
    )
    if source == "web":
        daily_query = daily_query.where(Job.chat_id.isnot(None))
    elif source == "api":
        daily_query = daily_query.where(Job.chat_id.is_(None))
        
    daily_query = daily_query.group_by("day").order_by("day")
    daily_result = await db.execute(daily_query)
    
    # Fill in missing days with 0
    activity_map = {row.day.isoformat(): row.count for row in daily_result.all()}
    
    daily_activity = []
    for i in range(7):
        d = (seven_days_ago + timedelta(days=i)).isoformat()
        daily_activity.append(DailyActivity(date=d, count=activity_map.get(d, 0)))
        
    return UserStatsResponse(
        total_jobs=total,
        completed_jobs=completed,
        failed_jobs=failed,
        processing_jobs=processing,
        credits_balance=current_user.credits_balance,
        daily_activity=daily_activity
    )

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

@router.get("/v1/chats", response_model=list[ChatResponse])
async def list_chats(
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db)
):
    query = (
        select(Chat)
        .where(Chat.user_id == current_user.id)
        .order_by(Chat.created_at.desc())
    )
    result = await db.execute(query)
    chats = result.scalars().all()
    
    return [
        ChatResponse(
            id=chat.id, 
            title=chat.title, 
            created_at=chat.created_at
        ) for chat in chats
    ]

@router.delete("/v1/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: uuid.UUID,
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db)
):
    query = select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    result = await db.execute(query)
    chat = result.scalar_one_or_none()
    
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
        
    await db.delete(chat)
    await db.commit()
    return None

@router.get("/v1/chats/{chat_id}/jobs", response_model=list[JobResponse])
async def get_chat_jobs(
    chat_id: uuid.UUID,
    current_user: User = Depends(api_key_auth),
    db: AsyncSession = Depends(get_db)
):
    # Verify chat ownership
    query = select(Chat).where(Chat.id == chat_id, Chat.user_id == current_user.id)
    result = await db.execute(query)
    chat = result.scalar_one_or_none()
    
    if not chat:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

    job_query = (
        select(Job)
        .where(Job.chat_id == chat_id)
        .order_by(Job.created_at.asc())
    )
    job_result = await db.execute(job_query)
    jobs = job_result.scalars().all()
    responses = []
    for job in jobs:
        queue_position = None
        if job.status == JobStatus.queued:
            pos_query = select(func.count(Job.id)).where(
                Job.status == JobStatus.queued,
                Job.created_at < job.created_at
            )
            pos_result = await db.execute(pos_query)
            queue_position = pos_result.scalar() + 1
            
        responses.append(JobResponse(
            job_id=job.id, 
            prompt=job.prompt, 
            status=job.status, 
            image_url=job.image_url, 
            created_at=job.created_at,
            completed_at=job.completed_at,
            chat_id=job.chat_id,
            queue_position=queue_position
        ))
        
    return responses

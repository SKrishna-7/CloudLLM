import uuid
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
import redis.asyncio as redis
import httpx

from app.api.dependencies import admin_auth, get_db, get_redis
from app.models.user import User, Job, APIKey

router = APIRouter(tags=["Admin"])

class PaginationQuery(BaseModel):
    page: int = Query(1, ge=1)
    page_size: int = Query(25, ge=1, le=100)
    search: Optional[str] = None

class RoleUpdateRequest(BaseModel):
    role: str

class CreditsUpdateRequest(BaseModel):
    credits_balance: int

@router.get("/v1/admin/overview")
async def get_overview(
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis),
    current_admin: User = Depends(admin_auth)
):
    total_users = await db.scalar(select(func.count(User.id)))
    
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    jobs_today = await db.scalar(select(func.count(Job.id)).where(Job.created_at >= today))
    
    # Simple success rate
    counts = dict((await db.execute(select(Job.status, func.count(Job.id)).group_by(Job.status))).all())
    completed = counts.get("completed", 0)
    failed = counts.get("failed", 0)
    total_finished = completed + failed
    success_rate = (completed / total_finished * 100) if total_finished > 0 else 100.0

    # Active Workers
    clients = await redis_client.client_list()
    active_workers = sum(1 for client in clients if client.get("name") == "gpu_worker")
    
    # Queue length
    queue_length = await redis_client.llen("image_queue")

    return {
        "total_users": total_users,
        "jobs_today": jobs_today,
        "success_rate": success_rate,
        "active_workers": active_workers,
        "queue_length": queue_length,
        "total_completed": completed,
        "total_failed": failed,
    }

@router.get("/v1/admin/users")
async def get_users(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(admin_auth)
):
    query = select(
        User.id,
        User.clerk_id,
        User.email,
        User.credits_balance,
        User.role,
        User.created_at,
        func.count(Job.id.distinct()).label("job_count"),
        func.count(APIKey.id.distinct()).label("api_key_count")
    ).outerjoin(Job, Job.user_id == User.id).outerjoin(APIKey, APIKey.user_id == User.id).group_by(User.id).order_by(desc(User.created_at))
    
    if search:
        query = query.where(User.email.ilike(f"%{search}%"))

    # Pagination
    offset = (page - 1) * page_size
    
    total_query = select(func.count(User.id))
    if search:
        total_query = total_query.where(User.email.ilike(f"%{search}%"))
        
    total = await db.scalar(total_query)
    
    result = await db.execute(query.offset(offset).limit(page_size))
    users = result.all()
    
    return {
        "items": [
            {
                "id": str(u.id),
                "clerk_id": u.clerk_id,
                "email": u.email,
                "credits_balance": u.credits_balance,
                "role": u.role,
                "created_at": u.created_at,
                "job_count": u.job_count,
                "api_key_count": u.api_key_count
            } for u in users
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 0
    }

@router.patch("/v1/admin/users/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    data: RoleUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(admin_auth)
):
    if current_admin.role != "super_admin" and data.role == "super_admin":
        raise HTTPException(status_code=403, detail="Only super_admin can assign super_admin role")
        
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.role = data.role
    await db.commit()
    return {"status": "success", "role": user.role}

@router.patch("/v1/admin/users/{user_id}/credits")
async def update_user_credits(
    user_id: uuid.UUID,
    data: CreditsUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(admin_auth)
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.credits_balance = data.credits_balance
    await db.commit()
    return {"status": "success", "credits_balance": user.credits_balance}

@router.get("/v1/admin/jobs")
async def get_jobs(
    page: int = 1,
    page_size: int = 25,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(admin_auth)
):
    query = select(Job, User.email).join(User, Job.user_id == User.id).order_by(desc(Job.created_at))
    
    if search:
        query = query.where(User.email.ilike(f"%{search}%") | Job.id.cast(str).ilike(f"%{search}%"))
        
    offset = (page - 1) * page_size
    
    total_query = select(func.count(Job.id))
    if search:
        total_query = total_query.join(User, Job.user_id == User.id).where(User.email.ilike(f"%{search}%") | Job.id.cast(str).ilike(f"%{search}%"))
        
    total = await db.scalar(total_query)
    
    result = await db.execute(query.offset(offset).limit(page_size))
    rows = result.all()
    
    items = []
    for job, email in rows:
        duration = None
        if job.completed_at and job.created_at:
            duration = (job.completed_at - job.created_at).total_seconds()
            
        items.append({
            "id": str(job.id),
            "user_email": email,
            "prompt": job.prompt,
            "status": job.status.value if hasattr(job.status, 'value') else job.status,
            "source": job.source,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
            "duration": duration,
            "image_url": job.image_url
        })
        
    return {
        "items": items,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 0
    }

@router.get("/v1/admin/api_keys")
async def get_api_keys(
    page: int = 1,
    page_size: int = 25,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(admin_auth)
):
    query = select(APIKey, User.email).join(User, APIKey.user_id == User.id).order_by(desc(APIKey.created_at))
    offset = (page - 1) * page_size
    total = await db.scalar(select(func.count(APIKey.id)))
    
    result = await db.execute(query.offset(offset).limit(page_size))
    rows = result.all()
    
    return {
        "items": [
            {
                "id": str(k.id),
                "prefix": k.prefix,
                "owner_email": email,
                "created_at": k.created_at,
                "last_used_at": k.last_used_at,
                "revoked_at": k.revoked_at,
                "status": "Revoked" if k.revoked_at else "Active"
            } for k, email in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 0
    }

@router.delete("/v1/admin/api_keys/{key_id}")
async def revoke_api_key(
    key_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(admin_auth)
):
    key = await db.get(APIKey, key_id)
    if not key:
        raise HTTPException(status_code=404, detail="API Key not found")
        
    key.revoked_at = datetime.utcnow()
    await db.commit()
    return {"status": "success", "message": "API key revoked"}

@router.get("/v1/admin/telemetry")
async def get_telemetry(
    query: str,
    start: Optional[str] = None,
    end: Optional[str] = None,
    step: Optional[str] = None,
    current_admin: User = Depends(admin_auth)
):
    """
    Secure proxy to the internal Prometheus instance.
    """
    prometheus_url = "http://localhost:9091/api/v1"
    
    try:
        async with httpx.AsyncClient() as client:
            if start and end and step:
                # Range query for charts
                resp = await client.get(
                    f"{prometheus_url}/query_range",
                    params={
                        "query": query,
                        "start": start,
                        "end": end,
                        "step": step
                    },
                    timeout=10.0
                )
            else:
                # Instant query for current stats
                resp = await client.get(
                    f"{prometheus_url}/query",
                    params={"query": query},
                    timeout=10.0
                )
            
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to communicate with Prometheus: {str(e)}"
        )

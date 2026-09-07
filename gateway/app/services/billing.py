from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update
from app.models.user import User
from app.core.logger import get_logger

logger = get_logger(__name__)

async def deduct_credit(user: User, db: AsyncSession, job_id: str = None) -> None:
    if user.credits_balance < 7:
        if job_id:
            logger.warning("Insufficient credits", extra={"job_id": job_id})
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits. Please top up your account. (7 credits required)"
        )
    
    stmt = (
        update(User)
        .where(User.id == user.id)
        .where(User.credits_balance >= 7)
        .values(credits_balance=User.credits_balance - 7)
    )
    result = await db.execute(stmt)
    
    if result.rowcount == 0:
        if job_id:
            logger.error("Failed to deduct credits due to concurrent update", extra={"job_id": job_id})
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Insufficient credits or concurrent transaction issue."
        )
        
    if job_id:
        logger.info("Billing deduction successful", extra={"job_id": job_id})

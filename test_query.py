import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func
from gateway.app.models.user import Job, JobStatus
import uuid

async def main():
    engine = create_async_engine('postgresql+asyncpg://split_user:split_password@localhost:5433/split_db')
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with async_session() as db:
        job_id = uuid.UUID('100b5517-8f2c-4c20-a53f-b8ece5a50fb6')
        query = select(Job).where(Job.id == job_id)
        result = await db.execute(query)
        job = result.scalar_one_or_none()
        
        print("Job status:", job.status)
        
        if job.status == JobStatus.queued:
            print("Job is queued, computing position...")
            pos_query = select(func.count(Job.id)).where(
                Job.status == JobStatus.queued,
                Job.created_at < job.created_at
            )
            pos_result = await db.execute(pos_query)
            queue_position = pos_result.scalar() + 1
            print("Queue position:", queue_position)
            
        print("Done.")

asyncio.run(main())

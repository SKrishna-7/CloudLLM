import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, func
from gateway.app.models.user import Job, JobStatus
from gateway.app.schemas.job import JobResponse
import uuid

async def main():
    engine = create_async_engine('postgresql+asyncpg://split_user:split_password@localhost:5433/split_db')
    async_session = sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    
    async with async_session() as db:
        job_id = uuid.UUID('100b5517-8f2c-4c20-a53f-b8ece5a50fb6')
        query = select(Job).where(Job.id == job_id)
        result = await db.execute(query)
        job = result.scalar_one_or_none()
        
        queue_position = 14
        try:
            resp = JobResponse(
                job_id=job.id, 
                prompt=job.prompt, 
                status=job.status, 
                image_url=job.image_url, 
                created_at=job.created_at, 
                completed_at=job.completed_at,
                chat_id=job.chat_id,
                queue_position=queue_position
            )
            print("Pydantic success:", resp)
        except Exception as e:
            print("Pydantic failed:", repr(e))
            
asyncio.run(main())

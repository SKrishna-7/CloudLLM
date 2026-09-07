import json
import uuid
import redis.asyncio as redis
from app.core.logger import get_logger
from opentelemetry import propagate

logger = get_logger(__name__)

from app.schemas.job import JobCreateRequest

async def push_job_to_queue(job_id: uuid.UUID, request: JobCreateRequest, redis_client: redis.Redis) -> None:
    job_id_str = str(job_id)
    payload = {
        "job_id": job_id_str,
        "prompt": request.prompt,
        "negative_prompt": request.negative_prompt,
        "steps": request.steps,
        "guidance_scale": request.guidance_scale,
        "width": request.width,
        "height": request.height,
    }
    
    # Inject OTel trace context into payload headers
    headers = {}
    propagate.inject(headers)
    payload["trace_headers"] = headers

    await redis_client.rpush("image_queue", json.dumps(payload))
    logger.info("Inserted job payload into Redis", extra={"job_id": job_id_str})

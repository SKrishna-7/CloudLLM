import uuid
from pydantic import BaseModel, Field

from datetime import datetime

class JobCreateRequest(BaseModel):
    prompt: str = Field(..., min_length=3, max_length=2000, description="The text prompt to generate an image from")
    negative_prompt: str | None = Field(default=None, max_length=2000)
    steps: int = Field(default=35, ge=10, le=50)
    guidance_scale: float = Field(default=3.4, ge=1.0, le=20.0)
    width: int = Field(default=832, ge=512, le=1536, multiple_of=64)
    height: int = Field(default=1216, ge=512, le=1536, multiple_of=64)
    init_image_url: str | None = None
    strength: float | None = Field(default=None, ge=0.0, le=1.0)
    
class JobResponse(BaseModel):
    job_id: uuid.UUID
    prompt: str
    status: str
    image_url: str | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None
    chat_id: uuid.UUID | None = None
    queue_position: int | None = None

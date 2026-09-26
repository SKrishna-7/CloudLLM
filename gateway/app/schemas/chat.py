import uuid
from pydantic import BaseModel
from datetime import datetime

class ChatResponse(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime

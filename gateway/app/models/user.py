import uuid
import enum
from sqlalchemy import String, Integer, CheckConstraint, ForeignKey, Enum, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from .base import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    clerk_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    credits_balance: Mapped[int] = mapped_column(Integer, CheckConstraint('credits_balance >= 0'), default=0, nullable=False)
    role: Mapped[str] = mapped_column(String, default="user", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    api_keys = relationship("APIKey", back_populates="user", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="user", cascade="all, delete-orphan")
    chats = relationship("Chat", back_populates="user", cascade="all, delete-orphan")

class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="chats")
    jobs = relationship("Job", back_populates="chat", cascade="all, delete-orphan")

class APIKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    key_hash: Mapped[str] = mapped_column(String, index=True, nullable=False)
    prefix: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user = relationship("User", back_populates="api_keys")

class JobStatus(str, enum.Enum):
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"

class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    prompt: Mapped[str] = mapped_column(String, nullable=False)
    negative_prompt: Mapped[str | None] = mapped_column(String, nullable=True)
    steps: Mapped[int] = mapped_column(Integer, default=35, nullable=False)
    guidance_scale: Mapped[float] = mapped_column(default=3.4, nullable=False)
    width: Mapped[int] = mapped_column(Integer, default=832, nullable=False)
    height: Mapped[int] = mapped_column(Integer, default=1216, nullable=False)
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.queued, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String, default="api", nullable=False)
    image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    init_image_url: Mapped[str | None] = mapped_column(String, nullable=True)
    strength: Mapped[float | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    chat_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("chats.id", ondelete="CASCADE"), nullable=True, index=True)

    user = relationship("User", back_populates="jobs")
    chat = relationship("Chat", back_populates="jobs")

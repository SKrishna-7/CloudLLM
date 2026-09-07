import hashlib
from collections.abc import AsyncGenerator

import redis.asyncio as redis
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.core.database import async_session_maker
from app.models.user import APIKey, User
from app.core.logger import get_logger

logger = get_logger(__name__)

# API Key header extraction
api_key_header = APIKeyHeader(name="Authorization", auto_error=True)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to yield a SQLAlchemy AsyncSession."""
    async with async_session_maker() as session:
        yield session

async def get_redis() -> AsyncGenerator[redis.Redis, None]:
    """Dependency to yield an async Redis client."""
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        yield redis_client
    finally:
        await redis_client.aclose()

import json
import base64
import uuid

import jwt
from jwt import PyJWKClient

# Cache the JWK client
jwks_client = PyJWKClient(settings.CLERK_JWKS_URL)

async def api_key_auth(
    api_key: str = Security(api_key_header),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Dual Authentication:
    1. Supports Bearer <API_KEY> for programmatic access
    2. Supports Bearer <CLERK_JWT> for the frontend dashboard
    """
    token = api_key.replace("Bearer ", "")
    
    # Heuristic: API Keys are short (e.g. uuid length), JWTs are long
    if len(token) > 100 and "." in token:
        try:
            # Verify JWT signature against Clerk JWKS
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload_data = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                options={"verify_aud": False}
            )
            
            clerk_id = payload_data.get("sub")
            if not clerk_id:
                raise ValueError("No sub in JWT")
                
            # Generate a deterministic UUID from the Clerk ID
            user_uuid = uuid.uuid5(uuid.NAMESPACE_OID, clerk_id)
            
            # Extract email if configured in Clerk JWT template, otherwise fallback
            email = payload_data.get("email", f"{clerk_id}@clerk.local")
        except Exception as e:
            logger.error(f"Failed to verify JWT: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid JWT Token: {e}"
            )
            
        # Get or Create the user on the fly so they have credits
        user = await db.get(User, user_uuid)
        if not user:
            user = User(
                id=user_uuid, 
                email=email, 
                credits_balance=50
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            
        return user
            
    # Fallback to standard API Key authentication
    key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    
    query = (
        select(APIKey)
        .options(joinedload(APIKey.user))
        .where(APIKey.key_hash == key_hash)
    )
    result = await db.execute(query)
    api_key_record = result.scalar_one_or_none()
    
    if not api_key_record:
        logger.warning(f"Invalid API Key or token length < 100. Token prefix: {token[:10]}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
        
    return api_key_record.user

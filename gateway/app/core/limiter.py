from slowapi import Limiter
from app.core.config import settings

def get_user_identifier(request):
    # 1. Rate limit by API Key / Token if provided
    auth = request.headers.get("Authorization")
    if auth:
        return auth
        
    # 2. Fallback to real client IP (X-Forwarded-For) if behind proxy
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
        
    # 3. Fallback to direct client IP
    return request.client.host if request.client else "127.0.0.1"

limiter = Limiter(key_func=get_user_identifier, storage_uri=settings.REDIS_URL)

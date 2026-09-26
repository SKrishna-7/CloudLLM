import os
import uuid
import hashlib
import secrets
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

DATABASE_URL = "postgresql+asyncpg://split_user:split_password@localhost:5433/split_db"

async def main():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    raw_token = secrets.token_hex(32)
    key_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    
    user_id = str(uuid.uuid4())
    api_key_id = str(uuid.uuid4())
    
    async with async_session() as session:
        # Insert a super_admin user
        await session.execute(text(
            f"INSERT INTO users (id, email, credits_balance, role) "
            f"VALUES ('{user_id}', 'admin@local.test', 1000, 'super_admin');"
        ))
        
        # Insert API key
        await session.execute(text(
            f"INSERT INTO api_keys (id, user_id, key_hash, prefix) "
            f"VALUES ('{api_key_id}', '{user_id}', '{key_hash}', 'test-');"
        ))
        
        await session.commit()
        
    print(f"RAW_TOKEN={raw_token}")
    print(f"USER_ID={user_id}")
    
    # Now let's test the endpoints using httpx
    import httpx
    
    headers = {"Authorization": f"Bearer {raw_token}"}
    base_url = "http://localhost:8000/v1"
    
    async with httpx.AsyncClient() as client:
        # Test Overview
        print("Testing /admin/overview...")
        r = await client.get(f"{base_url}/admin/overview", headers=headers)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}\n")
        
        # Test Users
        print("Testing /admin/users...")
        r = await client.get(f"{base_url}/admin/users", headers=headers)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}\n")
        
        # Test Jobs
        print("Testing /admin/jobs...")
        r = await client.get(f"{base_url}/admin/jobs", headers=headers)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}\n")
        
        # Test API Keys
        print("Testing /admin/api_keys...")
        r = await client.get(f"{base_url}/admin/api_keys", headers=headers)
        print(f"Status: {r.status_code}")
        print(f"Response: {r.text}\n")

if __name__ == "__main__":
    asyncio.run(main())

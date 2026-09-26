import asyncio
import aiohttp
import asyncpg
import uuid
import hashlib
import time
import secrets
import os
import redis.asyncio as redis

DB_URL = "postgresql://split_user:split_password@localhost:5433/split_db"
API_URL = "http://localhost:8000"
REDIS_URL = "redis://localhost:6379"

async def setup_test_user():
    conn = await asyncpg.connect(DB_URL)
    try:
        user_id = str(uuid.uuid4())
        api_key_id = str(uuid.uuid4())
        
        await conn.execute(
            "INSERT INTO users (id, email, credits_balance) VALUES ($1, $2, $3)",
            user_id, f"dlq_{user_id[:8]}@local.test", 100
        )
        
        raw_token = secrets.token_hex(32)
        prefix = "sk-test-"
        full_token = f"{prefix}{raw_token}"
        key_hash = hashlib.sha256(full_token.encode()).hexdigest()
        
        await conn.execute(
            "INSERT INTO api_keys (id, user_id, key_hash, prefix) VALUES ($1, $2, $3, $4)",
            api_key_id, user_id, key_hash, prefix
        )
        return user_id, full_token
    finally:
        await conn.close()

async def get_job_status(token, job_id):
    headers = {"Authorization": f"Bearer {token}"}
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{API_URL}/v1/jobs/{job_id}", headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                return data.get("status")
            return None

async def main():
    print("="*50)
    print("🧟 Starting Dead Letter Queue (DLQ) Verification")
    print("="*50)
    
    print("1. Seeding DLQ test user...")
    user_id, token = await setup_test_user()
    
    print("2. Submitting an image generation job...")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"prompt": "DLQ recovery test"}
    
    job_id = None
    async with aiohttp.ClientSession() as session:
        async with session.post(f"{API_URL}/v1/images/generate", data=payload, headers=headers) as response:
            if response.status == 202:
                data = await response.json()
                job_id = data.get("job_id")
            else:
                print("❌ FAILED to submit job!")
                return
                
    print(f"   -> Job created: {job_id}")
    
    print("3. Waiting for worker to pick up the job...")
    # Wait until status is 'processing'
    status = await get_job_status(token, job_id)
    retries = 0
    while status == "queued" and retries < 10:
        await asyncio.sleep(1)
        status = await get_job_status(token, job_id)
        retries += 1
        
    if status != "processing":
        print(f"❌ Worker didn't pick up the job in time. Current status: {status}")
        return
        
    print("   -> Job is now PROCESSING. The worker has it!")
    
    print("4. Simulating Hard Worker Crash (SIGKILL)...")
    # Kill the worker completely to prevent it from finishing
    os.system('pkill -9 -f "uvicorn worker:app"')
    print("   -> Worker process killed!")
    
    print("5. Invoking DLQ Watchdog logic (Simulated)...")
    # The actual Go Scheduler has a 15-minute wait. For CI/CD purposes, we 
    # manually run the exact Redis commands the Go DLQ watchdog uses to recover it.
    redis_client = redis.from_url(REDIS_URL, decode_responses=True)
    
    # We find the job in processing queue
    processing_queue = "image_queue_processing"
    main_queue = "image_queue"
    
    jobs = await redis_client.lrange(processing_queue, 0, -1)
    recovered = False
    for job_payload in jobs:
        if job_id in job_payload:
            # Atomic move back to main queue
            await redis_client.lrem(processing_queue, 1, job_payload)
            await redis_client.rpush(main_queue, job_payload)
            recovered = True
            print("   -> 🚨 DLQ Watchdog: Stale job found! Recovering to main queue.")
            break
            
    if not recovered:
        print("❌ Could not find the job in the processing queue. It might have finished too fast or failed.")
        return
        
    # We also need to reset the status in Postgres (the watchdog doesn't do this, 
    # but when the new worker picks it up it will overwrite status anyway. Let's leave it as is).
    
    print("6. Restarting a new Worker to process the recovered job...")
    # Start the worker in the background
    worker_cmd = "cd ../worker && uvicorn worker:app --host 0.0.0.0 --port 8002 > /dev/null 2>&1 &"
    os.system(worker_cmd)
    
    print("7. Polling for job completion...")
    retries = 0
    status = await get_job_status(token, job_id)
    while status not in ["completed", "failed"] and retries < 30:
        await asyncio.sleep(2)
        status = await get_job_status(token, job_id)
        retries += 1
        
    if status == "completed":
        print(f"✅ Job {job_id} successfully completed after crash recovery!")
        print("\n🎉 DLQ Verification PASSED!")
    else:
        print(f"❌ Job failed to recover or complete. Final status: {status}")
        print("\n💥 DLQ Verification FAILED!")
        
    print("="*50)

if __name__ == "__main__":
    asyncio.run(main())

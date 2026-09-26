import asyncio
import uuid
import secrets
import hashlib
import time
import requests
import asyncpg
from concurrent.futures import ThreadPoolExecutor

DB_URL = "postgresql://split_user:split_password@localhost:5433/split_db"
API_URL = "http://localhost:8000/v1"

async def setup_test_user():
    print("Setting up test user and API key...")
    raw_token_bytes = secrets.token_hex(32)
    raw_token = f"sk-test-{raw_token_bytes}"
    key_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    conn = await asyncpg.connect(DB_URL)
    api_key_id = str(uuid.uuid4())
    
    # Check if user already exists
    existing_user_id = await conn.fetchval("SELECT id FROM users WHERE email = 'stress@test.local'")
    if existing_user_id:
        user_id = str(existing_user_id)
        await conn.execute("UPDATE users SET credits_balance = 1000 WHERE id = $1", existing_user_id)
    else:
        user_id = str(uuid.uuid4())
        await conn.execute(
            "INSERT INTO users (id, email, credits_balance) VALUES ($1, 'stress@test.local', 1000)",
            user_id
        )
    await conn.execute(
        "INSERT INTO api_keys (id, user_id, key_hash, prefix) VALUES ($1, $2, $3, 'sk-test-')",
        api_key_id, user_id, key_hash
    )
    await conn.close()
    
    print(f"Test user created. Token: {raw_token}")
    return raw_token

def send_request(token, idx):
    headers = {"Authorization": f"Bearer {token}"}
    data = {"prompt": f"Stress test image {idx}", "steps": 10} # Reduced steps for faster test
    try:
        start = time.time()
        resp = requests.post(f"{API_URL}/images/generate", headers=headers, data=data)
        return resp.json(), time.time() - start
    except Exception as e:
        return {"error": str(e)}, 0

def check_status(token, job_id):
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{API_URL}/jobs/{job_id}", headers=headers)
    resp.raise_for_status()
    return resp.json()

async def main():
    token = await setup_test_user()
    
    NUM_REQUESTS = 10
    print(f"\n🚀 Sending {NUM_REQUESTS} concurrent requests to Gateway...")
    
    jobs = []
    with ThreadPoolExecutor(max_workers=NUM_REQUESTS) as executor:
        futures = [executor.submit(send_request, token, i) for i in range(NUM_REQUESTS)]
        for idx, f in enumerate(futures):
            res, duration = f.result()
            if "job_id" in res:
                jobs.append(res["job_id"])
                print(f"✅ Request {idx} accepted! Job ID: {res['job_id']}")
            else:
                print(f"❌ Request {idx} failed: {res}")
                
    print("\n📊 Tracking Queue Positions...")
    
    completed = set()
    while len(completed) < len(jobs):
        print("\n--- Current Queue Status ---")
        for i, job_id in enumerate(jobs):
            if job_id in completed:
                continue
                
            status_data = check_status(token, job_id)
            status = status_data.get("status")
            pos = status_data.get("queue_position")
            
            if status == "completed":
                print(f"Job {i}: COMPLETED! Latency: {status_data.get('completed_at')}")
                completed.add(job_id)
            elif status == "failed":
                print(f"Job {i}: FAILED!")
                completed.add(job_id)
            elif status == "processing":
                print(f"Job {i}: ⚙️  PROCESSING (GPU active)")
            else:
                print(f"Job {i}: ⏳ QUEUED (Position: {pos})")
                
        if len(completed) < len(jobs):
            time.sleep(2)

if __name__ == "__main__":
    asyncio.run(main())

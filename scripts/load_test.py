import asyncio
import aiohttp
import asyncpg
import uuid
import hashlib
import time
import secrets

DB_URL = "postgresql://split_user:split_password@localhost:5432/split_db"
API_URL = "http://localhost:8000"

async def seed_database():
    """Seeds a test user with exactly 10 credits and generates an API key."""
    conn = await asyncpg.connect(DB_URL)
    try:
        user_id = str(uuid.uuid4())
        api_key_id = str(uuid.uuid4())
        
        # Insert User
        await conn.execute(
            "INSERT INTO users (id, email, credits_balance) VALUES ($1, $2, $3)",
            user_id, f"loadtest_{user_id[:8]}@local.test", 10
        )
        
        # Generate API Key
        raw_token = secrets.token_hex(32)
        prefix = "sk-load-"
        full_token = f"{prefix}{raw_token}"
        
        # The Gateway's APIKeyHeader extracts the exact string sent in the header.
        # Since we send "Authorization: Bearer sk-load-...", we must hash the entire string
        # to match what dependencies.py calculates.
        curl_header = f"Bearer {full_token}"
        key_hash = hashlib.sha256(curl_header.encode()).hexdigest()
        
        # Insert API Key
        await conn.execute(
            "INSERT INTO api_keys (id, user_id, key_hash, prefix) VALUES ($1, $2, $3, $4)",
            api_key_id, user_id, key_hash, prefix
        )
        
        return user_id, full_token
    finally:
        await conn.close()

async def fire_single_request(session, token, index):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"prompt": f"Load test generation #{index}"}
    try:
        async with session.post(f"{API_URL}/v1/images/generate", json=payload, headers=headers) as response:
            if response.status == 202:
                data = await response.json()
                return data.get("job_id")
            else:
                text = await response.text()
                print(f"Request {index} failed with {response.status}: {text}")
                return None
    except Exception as e:
        print(f"Request {index} crashed: {e}")
        return None

async def fire_requests(token, num_requests=10):
    """Fires requests concurrently using asyncio.gather."""
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        tasks = [fire_single_request(session, token, i) for i in range(num_requests)]
        results = await asyncio.gather(*tasks)
        
    return [job_id for job_id in results if job_id is not None]

async def poll_jobs(job_ids):
    """Polls the API until all jobs are either completed or failed."""
    timeout = aiohttp.ClientTimeout(total=10)
    completed_jobs = {}
    
    async with aiohttp.ClientSession(timeout=timeout) as session:
        while len(completed_jobs) < len(job_ids):
            for job_id in job_ids:
                if job_id in completed_jobs:
                    continue
                    
                try:
                    async with session.get(f"{API_URL}/v1/jobs/{job_id}") as response:
                        if response.status == 200:
                            data = await response.json()
                            status = data.get("status")
                            if status in ["completed", "failed"]:
                                completed_jobs[job_id] = data
                except Exception as e:
                    print(f"Polling error for {job_id}: {e}")
            
            if len(completed_jobs) < len(job_ids):
                await asyncio.sleep(2)
                
    return completed_jobs

async def verify_and_report(user_id, completed_jobs, total_time):
    """Verifies DB constraints and prints a beautifully formatted report."""
    conn = await asyncpg.connect(DB_URL)
    try:
        # Check balance
        row = await conn.fetchrow("SELECT credits_balance FROM users WHERE id = $1", user_id)
        credits_balance = row["credits_balance"]
        
        # Check DB jobs
        db_jobs = await conn.fetch("SELECT status FROM jobs WHERE user_id = $1", user_id)
        db_completed = [j for j in db_jobs if j["status"] == "completed"]
        
        # Formatting report
        print("\n" + "="*50)
        print("🚀 LOAD TEST EXECUTION REPORT")
        print("="*50)
        print(f"⏱️  Total Execution Time : {total_time:.2f} seconds")
        print(f"🪙  Final Credit Balance : {credits_balance} (Expected: 0)")
        print(f"📦 Total Jobs Tracked   : {len(completed_jobs)}")
        
        success_count = sum(1 for j in completed_jobs.values() if j.get("status") == "completed")
        print(f"✅ Success Rate         : {success_count}/{len(completed_jobs)} completed")
        print("-" * 50)
        
        # Assertions
        assert credits_balance == 0, f"Credits balance should be 0, but is {credits_balance}"
        assert len(db_completed) == 10, f"Expected 10 completed jobs in DB, found {len(db_completed)}"
        
        print("🌟 All Assertions Passed: End-to-End atomicity confirmed!")
        print("-" * 50)
        
        if success_count > 0:
            print("📸 Sample Image URLs:")
            sample_urls = [j.get("image_url") for j in completed_jobs.values() if j.get("image_url")][:3]
            for url in sample_urls:
                print(f"   -> {url}")
                
        print("="*50 + "\n")
        
    finally:
        await conn.close()

async def main():
    print("Starting Load Test...")
    
    start_time = time.time()
    
    print("1. Seeding Database...")
    user_id, token = await seed_database()
    
    print(f"2. Firing 10 Concurrent Requests...")
    job_ids = await fire_requests(token, num_requests=10)
    print(f"   -> Successfully queued {len(job_ids)} jobs.")
    
    if not job_ids:
        print("No jobs queued. Exiting.")
        return
        
    print("3. Polling for Job Completion (Every 2 seconds)...")
    completed_jobs = await poll_jobs(job_ids)
    
    end_time = time.time()
    
    print("4. Verifying DB State...")
    await verify_and_report(user_id, completed_jobs, end_time - start_time)

if __name__ == "__main__":
    asyncio.run(main())

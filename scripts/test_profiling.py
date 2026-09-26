import asyncio
import aiohttp
import asyncpg
import uuid
import hashlib
import time
import secrets
import numpy as np

DB_URL = "postgresql://split_user:split_password@localhost:5433/split_db"
API_URL = "http://localhost:8000"

NUM_USERS = 50
REQS_PER_USER = 10

async def setup_test_users(num_users):
    """Seeds test users with credits and generates API keys."""
    conn = await asyncpg.connect(DB_URL)
    tokens = []
    try:
        for i in range(num_users):
            user_id = str(uuid.uuid4())
            api_key_id = str(uuid.uuid4())
            
            await conn.execute(
                "INSERT INTO users (id, email, credits_balance) VALUES ($1, $2, $3)",
                user_id, f"profiler_{user_id[:8]}@local.test", 100
            )
            
            raw_token = secrets.token_hex(32)
            prefix = "sk-test-"
            full_token = f"{prefix}{raw_token}"
            
            key_hash = hashlib.sha256(full_token.encode()).hexdigest()
            
            await conn.execute(
                "INSERT INTO api_keys (id, user_id, key_hash, prefix) VALUES ($1, $2, $3, $4)",
                api_key_id, user_id, key_hash, prefix
            )
            tokens.append(full_token)
        return tokens
    finally:
        await conn.close()

async def fire_single_request(session, token, index, sem):
    async with sem:
        headers = {"Authorization": f"Bearer {token}"}
        payload = {"prompt": f"Profiling test {index}"}
        start = time.perf_counter()
        try:
            async with session.post(f"{API_URL}/v1/images/generate", data=payload, headers=headers) as response:
                latency = time.perf_counter() - start
                if response.status != 202:
                    text = await response.text()
                    print(f"Error {response.status}: {text}")
                return response.status, latency
        except Exception as e:
            print(f"Request exception: {e}")
            return 0, 0.0

async def main():
    print("="*50)
    print("⚡ Starting P99 Overhead Profiling")
    print("="*50)
    
    print(f"1. Seeding {NUM_USERS} test users...")
    tokens = await setup_test_users(NUM_USERS)
    
    print(f"2. Firing {NUM_USERS * REQS_PER_USER} concurrent requests to Gateway...")
    
    timeout = aiohttp.ClientTimeout(total=120)
    sem = asyncio.Semaphore(50)  # Limit concurrency to 50
    async with aiohttp.ClientSession(timeout=timeout) as session:
        tasks = []
        for token in tokens:
            for i in range(REQS_PER_USER):
                tasks.append(fire_single_request(session, token, i, sem))
                
        try:
            results = await asyncio.gather(*tasks)
        except Exception as e:
            print(f"Gather failed: {e}")
            return
        
    latencies = []
    successes = 0
    failures = 0
    
    for status, latency in results:
        if status == 202:
            successes += 1
            latencies.append(latency * 1000) # Convert to ms
        else:
            failures += 1
            
    print("\n--- LATENCY REPORT (Gateway Overhead) ---")
    print(f"Total Requests: {len(results)}")
    print(f"Successful (HTTP 202): {successes}")
    print(f"Failed: {failures}")
    
    if latencies:
        print("\n--- PERCENTILES (ms) ---")
        print(f"Average: {np.mean(latencies):.2f} ms")
        print(f"P50 (Median): {np.percentile(latencies, 50):.2f} ms")
        print(f"P90: {np.percentile(latencies, 90):.2f} ms")
        print(f"P95: {np.percentile(latencies, 95):.2f} ms")
        print(f"P99: {np.percentile(latencies, 99):.2f} ms")
        print(f"Max: {np.max(latencies):.2f} ms")
        
        # Verify overhead constraints
        p99_latency = np.percentile(latencies, 99)
        if p99_latency > 1500:
            print(f"⚠️  WARNING: P99 latency ({p99_latency:.2f}ms) is higher than expected (<1500ms). Gateway is bottlenecking!")
        else:
            print(f"✅ PERFORMANCE OK: P99 latency is excellent.")
            
    print("="*50)

if __name__ == "__main__":
    asyncio.run(main())

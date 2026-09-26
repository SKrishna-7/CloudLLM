import asyncio
import aiohttp
import asyncpg
import uuid
import hashlib
import time
import secrets

DB_URL = "postgresql://split_user:split_password@localhost:5433/split_db"
API_URL = "http://localhost:8000"

async def setup_test_user():
    """Seeds a test user with 200 credits and generates an API key."""
    conn = await asyncpg.connect(DB_URL)
    try:
        user_id = str(uuid.uuid4())
        api_key_id = str(uuid.uuid4())
        
        await conn.execute(
            "INSERT INTO users (id, email, credits_balance) VALUES ($1, $2, $3)",
            user_id, f"ddos_{user_id[:8]}@local.test", 200
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

async def fire_single_request(session, token, index):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"prompt": f"DDoS test {index}"}
    start = time.perf_counter()
    try:
        async with session.post(f"{API_URL}/v1/images/generate", data=payload, headers=headers) as response:
            latency = time.perf_counter() - start
            return response.status, latency
    except Exception as e:
        return 0, 0.0

async def main():
    print("="*50)
    print("🛡️  Starting Security & DDoS Simulation")
    print("="*50)
    
    print("1. Setting up test user...")
    user_id, token = await setup_test_user()
    
    # We want to send 100 concurrent requests instantly
    print("2. Firing 100 concurrent requests to Gateway...")
    
    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        tasks = [fire_single_request(session, token, i) for i in range(100)]
        results = await asyncio.gather(*tasks)
        
    status_counts = {}
    latencies = []
    
    for status, latency in results:
        status_counts[status] = status_counts.get(status, 0) + 1
        latencies.append(latency)
        
    print("\n--- RESULTS ---")
    for status, count in sorted(status_counts.items()):
        print(f"HTTP {status}: {count} requests")
        
    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    print(f"Average Latency: {avg_latency*1000:.2f} ms")
    
    # Verification
    print("\n--- VERIFICATION ---")
    successes = status_counts.get(202, 0)
    too_many = status_counts.get(429, 0)
    
    passed = True
    if successes > 10:
        print(f"❌ FAILED: Expected max 10 successful requests, got {successes}. Rate limiting failed!")
        passed = False
    elif successes == 0:
        print("❌ FAILED: Expected some successful requests, got 0. Is the API down?")
        passed = False
    else:
        print(f"✅ Rate limiter correctly allowed {successes} requests (limit is 10/min).")
        
    if too_many == 0:
        print("❌ FAILED: Expected 429 Too Many Requests responses, got 0.")
        passed = False
    else:
        print(f"✅ Rate limiter correctly blocked {too_many} requests.")
        
    if passed:
        print("\n🎉 DDoS Simulation PASSED!")
    else:
        print("\n💥 DDoS Simulation FAILED!")
        
    print("="*50)

if __name__ == "__main__":
    asyncio.run(main())

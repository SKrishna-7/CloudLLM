import asyncio
import aiohttp
import asyncpg
import uuid
import hashlib
import time
import secrets
import os

DB_URL = "postgresql://split_user:split_password@localhost:5433/split_db"
API_URL = "http://localhost:8000"

async def setup_test_user():
    conn = await asyncpg.connect(DB_URL)
    try:
        user_id = str(uuid.uuid4())
        api_key_id = str(uuid.uuid4())
        
        await conn.execute(
            "INSERT INTO users (id, email, credits_balance) VALUES ($1, $2, $3)",
            user_id, f"chaos_{user_id[:8]}@local.test", 1000
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

async def fire_request(session, token, index):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"prompt": f"Chaos test {index}"}
    try:
        async with session.post(f"{API_URL}/v1/images/generate", data=payload, headers=headers) as response:
            return response.status
    except Exception as e:
        return 0

async def traffic_generator(token, duration=15):
    """Generates continuous traffic for `duration` seconds, recording status codes."""
    start_time = time.time()
    results = []
    
    async with aiohttp.ClientSession() as session:
        idx = 0
        while time.time() - start_time < duration:
            status = await fire_request(session, token, idx)
            results.append(status)
            idx += 1
            await asyncio.sleep(0.5) # 2 requests per second
            
    return results

async def chaos_monkey():
    """Drops the Redis container mid-test, then restores it."""
    print("   🐒 Chaos Monkey: Waiting 3 seconds...")
    await asyncio.sleep(3)
    
    print("   🐒 Chaos Monkey: Stopping Redis container!")
    os.system("docker compose stop redis > /dev/null 2>&1")
    
    print("   🐒 Chaos Monkey: Redis is DOWN. Waiting 5 seconds...")
    await asyncio.sleep(5)
    
    print("   🐒 Chaos Monkey: Starting Redis container!")
    os.system("docker compose start redis > /dev/null 2>&1")
    print("   🐒 Chaos Monkey: Redis is UP.")

async def main():
    print("="*50)
    print("🌪️  Starting Chaos Engineering Verification")
    print("="*50)
    
    print("1. Seeding test user...")
    user_id, token = await setup_test_user()
    
    print("2. Starting continuous traffic & Chaos Monkey concurrently...")
    
    # Run traffic and chaos monkey at the same time
    traffic_task = asyncio.create_task(traffic_generator(token, duration=15))
    chaos_task = asyncio.create_task(chaos_monkey())
    
    await asyncio.gather(traffic_task, chaos_task)
    
    results = traffic_task.result()
    
    print("\n--- RESULTS ---")
    status_counts = {}
    for r in results:
        status_counts[r] = status_counts.get(r, 0) + 1
        
    for status, count in sorted(status_counts.items()):
        print(f"HTTP {status}: {count} requests")
        
    print("\n--- VERIFICATION ---")
    successes = status_counts.get(202, 0)
    service_unavail = status_counts.get(503, 0)
    internal_errors = status_counts.get(500, 0)
    
    passed = True
    if successes == 0:
        print("❌ FAILED: Zero successful requests. System is completely broken.")
        passed = False
    elif service_unavail == 0:
        print("❌ FAILED: Expected some 503 Service Unavailable when Redis was down, but got none.")
        passed = False
    elif internal_errors > 0:
        print(f"❌ FAILED: Got {internal_errors} HTTP 500 Internal Server Errors. The system didn't degrade gracefully!")
        passed = False
    else:
        print(f"✅ System degraded gracefully during Redis outage ({service_unavail} blocked requests with 503).")
        print(f"✅ System recovered successfully after Redis restart ({successes} successful requests).")
        
    print("\n3. Verifying Database Rollbacks...")
    conn = await asyncpg.connect(DB_URL)
    try:
        # Check credit balance
        row = await conn.fetchrow("SELECT credits_balance FROM users WHERE id = $1", user_id)
        balance = row["credits_balance"]
        
        # Expected balance = 1000 - (successes * 7)
        expected_balance = 1000 - (successes * 7)
        
        if balance == expected_balance:
            print(f"✅ Transaction Rollbacks working! Credits match successfully completed jobs ({balance}).")
        else:
            print(f"❌ FAILED: Transaction rollback issue. Expected {expected_balance} credits, but have {balance}.")
            passed = False
            
        # Verify no orphaned jobs in DB
        db_jobs = await conn.fetchval("SELECT COUNT(id) FROM jobs WHERE user_id = $1", user_id)
        if db_jobs == successes:
            print(f"✅ No orphaned jobs found. Database cleanly rolled back failed insertions.")
        else:
            print(f"❌ FAILED: Found {db_jobs} jobs in DB but only {successes} succeeded via API.")
            passed = False
            
    finally:
        await conn.close()
        
    if passed:
        print("\n🎉 Chaos Engineering Verification PASSED!")
    else:
        print("\n💥 Chaos Engineering Verification FAILED!")
        
    print("="*50)

if __name__ == "__main__":
    asyncio.run(main())

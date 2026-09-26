import asyncio
import asyncpg
import requests

async def main():
    conn = await asyncpg.connect("postgresql://split_user:split_password@localhost:5433/split_db")
    # Get the user_id for stress@test.local
    user_id = await conn.fetchval("SELECT id FROM users WHERE email = 'stress@test.local'")
    print("User ID:", user_id)
    # The API key was inserted with prefix sk-test-
    # But we don't know the raw key because it's random on each run!
    # Wait, stress_test.py creates a NEW token every run and overwrites the DB? No, it DOES NOT update the API key if it already exists, wait!
    pass

asyncio.run(main())

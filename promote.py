import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://split_user:split_password@localhost:5433/split_db')
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET role='super_admin' WHERE role='user'"))
    print('Updated users')
    await engine.dispose()

if __name__ == '__main__':
    asyncio.run(main())

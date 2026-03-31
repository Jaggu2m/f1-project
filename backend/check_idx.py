import asyncio
from sqlalchemy import inspect
from app.core.database import engine

async def check_indexes():
    def _inspect(conn):
        insp = inspect(conn)
        print("Telemetry Indexes:")
        for idx in insp.get_indexes("telemetry"):
            print(" -", idx['name'], idx['column_names'])

    async with engine.connect() as conn:
        await conn.run_sync(_inspect)

if __name__ == "__main__":
    asyncio.run(check_indexes())

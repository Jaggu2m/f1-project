import asyncio
import sys
import os

from app.services.ingestion import ingest_race

async def main():
    print("Testing data ingestion for Season 2023, Round 10...")
    await ingest_race(2023, 10)
    print("Data ingestion test completed.")

if __name__ == "__main__":
    asyncio.run(main())

import asyncio
import json
import sys
import os

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.api.race import get_all_race_data

async def main():
    db = AsyncSessionLocal()
    try:
        data = await get_all_race_data(2023, 10, db)
        
        if "error" in data or "status" in data and data.get("status") != "ready":
             print(f"Race not ready: {data}")
             return

        # Attempt to dump to standard JSON to see where it collapses
        try:
            json.dumps(data)
            print("SUCCESS! data is fully json serializable.")
        except TypeError as e:
            print(f"JSON Error: {e}")
            
            # Let's find the offending key recursively
            def find_bad_type(obj, path=""):
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        find_bad_type(v, path + f".{k}")
                elif isinstance(obj, list):
                    for i, v in enumerate(obj):
                        find_bad_type(v, path + f"[{i}]")
                elif isinstance(obj, (int, float, str, bool, type(None))):
                    pass
                else:
                    print(f"Found non-serializable type {type(obj)} at {path}: {obj}")
            
            find_bad_type(data, "root")

    finally:
        await db.close()

if __name__ == "__main__":
    asyncio.run(main())

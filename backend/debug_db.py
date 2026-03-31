import asyncio
import logging
import sys
import os
from sqlalchemy import text

# Add project root to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def main():
    try:
        logger.info("Connecting to database...")
        async with engine.begin() as conn:
            logger.info("Attempting to create 'races' table via RAW SQL...")
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS races (
                    id SERIAL PRIMARY KEY,
                    season INTEGER NOT NULL,
                    round INTEGER NOT NULL,
                    circuit_name VARCHAR,
                    total_laps INTEGER,
                    track_length FLOAT,
                    status VARCHAR DEFAULT 'processing'
                );
            """))
            logger.info("Table 'races' created (or already exists).")
            
            # Verify it exists
            result = await conn.execute(text("SELECT count(*) FROM races"))
            count = result.scalar()
            logger.info(f"Race count: {count}")

    except Exception as e:
        logger.error(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())

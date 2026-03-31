import asyncio
import time
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.models import Race, Driver, Position, Telemetry, Lap, PitStop

async def profile_bulk():
    async with AsyncSessionLocal() as db:
        t0 = time.time()
        print("Starting bulk profile...")
        r_result = await db.execute(select(Race).filter_by(season=2023, round=10))
        race = r_result.scalars().first()
        
        d_result = await db.execute(select(Driver).filter_by(race_id=race.id))
        drivers = d_result.scalars().all()
        driver_ids = [d.id for d in drivers]
        print(f"Fetch drivers: {time.time() - t0:.2f}s")
        
        t0 = time.time()
        p_res = await db.execute(
            select(Position.driver_id, Position.t, Position.s, Position.lap)
            .filter(Position.driver_id.in_(driver_ids)).order_by(Position.driver_id, Position.t)
        )
        print(f"Bulk Positions ({len(p_res.all())}): {time.time() - t0:.2f}s")
        
        t0 = time.time()
        tel_res = await db.execute(
            select(Telemetry.driver_id, Telemetry.t, Telemetry.speed, Telemetry.rpm, 
                   Telemetry.gear, Telemetry.throttle, Telemetry.brake, Telemetry.drs)
            .filter(Telemetry.driver_id.in_(driver_ids)).order_by(Telemetry.driver_id, Telemetry.t)
        )
        print(f"Bulk Telemetry ({len(tel_res.all())}): {time.time() - t0:.2f}s")

if __name__ == "__main__":
    asyncio.run(profile_bulk())

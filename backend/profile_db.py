import asyncio
import time
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal
from app.models import Race, Driver, Position, Telemetry, Lap, PitStop

async def profile():
    async with AsyncSessionLocal() as db:
        print("Starting profile...")
        t0 = time.time()
        r_result = await db.execute(select(Race).filter_by(season=2023, round=10))
        race = r_result.scalars().first()
        print(f"Fetch race: {time.time() - t0:.2f}s")
        
        t0 = time.time()
        d_result = await db.execute(select(Driver).filter_by(race_id=race.id))
        drivers = d_result.scalars().all()
        print(f"Fetch drivers: {time.time() - t0:.2f}s")
        
        for d in drivers:
            print(f"Driver {d.driver_code}:")
            
            t0 = time.time()
            p_res = await db.execute(select(Position.t, Position.s, Position.lap).filter_by(driver_id=d.id).order_by(Position.t))
            positions = p_res.all()
            print(f"  Positions ({len(positions)}): {time.time() - t0:.2f}s")
            
            t0 = time.time()
            tel_res = await db.execute(
                select(Telemetry.t, Telemetry.speed, Telemetry.rpm, Telemetry.gear, Telemetry.throttle, Telemetry.brake, Telemetry.drs)
                .filter_by(driver_id=d.id).order_by(Telemetry.t)
            )
            telemetry = tel_res.all()
            print(f"  Telemetry ({len(telemetry)}): {time.time() - t0:.2f}s")
            
            break # Just one driver

if __name__ == "__main__":
    asyncio.run(profile())

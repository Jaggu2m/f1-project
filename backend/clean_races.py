import asyncio
from app.core.database import AsyncSessionLocal
from sqlalchemy import select, delete
from app.models import Race, Position

async def wipe_ghost_races():
    db = AsyncSessionLocal()
    r_result = await db.execute(select(Race))
    races = r_result.scalars().all()
    
    for r in races:
        if r.status == "ready":
             pos_count = await db.execute(select(Position).filter_by(driver_id=r.id).limit(1))
             # Since driver_id = r.id is wrong conceptually but just roughly checking if any position exists for any driver in this race
             # Better check:
             from app.models import Driver
             drivers = await db.execute(select(Driver.id).filter_by(race_id=r.id))
             d_ids = [d.id for d in drivers.scalars().all()]
             if d_ids:
                 pos = await db.execute(select(Position).filter(Position.driver_id.in_(d_ids)).limit(1))
                 if not pos.scalars().first():
                     print(f"Deleting corrupted race {r.season} {r.round}")
                     await db.execute(delete(Race).filter_by(id=r.id))
    
    await db.commit()
    await db.close()

if __name__ == "__main__":
    asyncio.run(wipe_ghost_races())

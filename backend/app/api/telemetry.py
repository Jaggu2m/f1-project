from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models import Race, Driver, Telemetry

router = APIRouter()

@router.get("/race/{season}/{round}/telemetry")
async def get_telemetry(
    season: int,
    round: int,
    driver: str,
    start: float,
    end: float,
    db: AsyncSession = Depends(get_db)
):
    # Get Race
    r_result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = r_result.scalars().first()
    if not race: return []

    # Get Driver
    d_result = await db.execute(select(Driver).filter_by(race_id=race.id, driver_code=driver))
    db_driver = d_result.scalars().first()
    if not db_driver: return []

    # Get Telemetry in range
    query = (
        select(Telemetry)
        .filter(
            Telemetry.driver_id == db_driver.id,
            Telemetry.t >= start,
            Telemetry.t <= end
        )
        .order_by(Telemetry.t.asc())
    )
    
    res = await db.execute(query)
    rows = res.scalars().all()
    
    return [
        {
            "t": r.t,
            "speed": r.speed,
            "rpm": r.rpm,
            "throttle": r.throttle,
            "brake": r.brake,
            "gear": r.gear,
            "drs": r.drs
        }
        for r in rows
    ]

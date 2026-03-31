from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models import Race, Driver, Position

router = APIRouter()

@router.get("/race/{season}/{round}/positions")
async def get_positions(season: int, round: int, t: float, db: AsyncSession = Depends(get_db)):
    # 1. Get Race
    r_result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = r_result.scalars().first()
    if not race: return []

    # 2. Get Drivers
    d_result = await db.execute(select(Driver).filter_by(race_id=race.id))
    drivers = d_result.scalars().all()

    # 3. For each driver, find s at t
    # Optimization: Use a single complex query or window function in SQL
    # For now, simple loop is safer for implementation speed
    
    response = []
    
    for d in drivers:
        # Find closest pos <= t
        query = (
            select(Position)
            .filter(Position.driver_id == d.id, Position.t <= t)
            .order_by(Position.t.desc())
            .limit(1)
        )
        p_res = await db.execute(query)
        pos = p_res.scalars().first()
        
        if pos:
            response.append({
                "driverCode": d.driver_code,
                "s": pos.s,
                "lap": pos.lap,
                "inPit": False # TODO
            })
    
    # Sort by s desc (leader first)
    response.sort(key=lambda x: x["s"], reverse=True)
    return response

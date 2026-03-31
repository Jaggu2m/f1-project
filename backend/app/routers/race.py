from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from app.database import get_db
from app.models import Race, Driver, Position, Telemetry
from app.services.race_ingestion import process_race

router = APIRouter()

@router.get("/race/{season}/{round}")
async def get_race(season: int, round: int, bg: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = result.scalars().first()

    if race:
        return {"status": race.status, "race_id": race.id}

    # If not found, trigger ingestion
    new_race = Race(season=season, round=round, status="processing")
    db.add(new_race)
    await db.commit()
    await db.refresh(new_race)

    bg.add_task(process_race, season, round)

    return {"status": "processing", "race_id": new_race.id}

@router.get("/race/{season}/{round}/positions")
async def get_positions(
    season: int, 
    round: int, 
    t: float, 
    db: AsyncSession = Depends(get_db)
):
    # Find the race first
    result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = result.scalars().first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    # Get all drivers for this race
    drivers_result = await db.execute(select(Driver).filter_by(race_id=race.id))
    drivers = drivers_result.scalars().all()
    
    response = []
    
    # Optimize: This could be a single complex query, but loop is simpler for now
    for driver in drivers:
        # Get latest position <= t
        # Equivalent to: SELECT * FROM positions WHERE driver_id=... AND t <= ... ORDER BY t DESC LIMIT 1
        query = (
            select(Position)
            .filter(Position.driver_id == driver.id, Position.t <= t)
            .order_by(Position.t.desc())
            .limit(1)
        )
        pos_result = await db.execute(query)
        pos = pos_result.scalars().first()
        
        if pos:
            response.append({
                "driverCode": driver.driver_code,
                "s": pos.s,
                "lap": pos.lap,
                # "inPit": ... # would need check against pitstops or extra logic
            })
            
    return response

@router.get("/race/{season}/{round}/telemetry")
async def get_telemetry(
    season: int,
    round: int,
    driver_code: str,
    start: float,
    end: float,
    db: AsyncSession = Depends(get_db)
):
    # Find race
    result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = result.scalars().first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
        
    # Find driver
    driver_result = await db.execute(select(Driver).filter_by(race_id=race.id, driver_code=driver_code))
    driver = driver_result.scalars().first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
        
    # Query telemetry
    query = (
        select(Telemetry)
        .filter(
            Telemetry.driver_id == driver.id,
            Telemetry.t >= start,
            Telemetry.t <= end
        )
        .order_by(Telemetry.t.asc())
    )
    
    tel_result = await db.execute(query)
    telemetry_rows = tel_result.scalars().all()
    
    return [
        {
            "t": row.t,
            "speed": row.speed,
            "rpm": row.rpm,
            "gear": row.gear,
            "throttle": row.throttle,
            "brake": row.brake,
            "drs": row.drs
        }
        for row in telemetry_rows
    ]

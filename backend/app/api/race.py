from fastapi import APIRouter, Depends, BackgroundTasks
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
import json
from app.models import Race, Driver, TrackPoint
from app.services.ingestion import ingest_race

router = APIRouter()

@router.get("/{season}/{round}")
async def get_race(season: int, round: int, bg: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = result.scalars().first()

    if race:
        return {"status": race.status, "race_id": race.id}

    # Trigger ingestion
    bg.add_task(ingest_race, season, round)
    return {"status": "processing"}

@router.get("/{season}/{round}/track")
async def get_track(season: int, round: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = result.scalars().first()
    
    if not race:
         return {"error": "Race not found"}

    # Fetch points (ordered by index)
    p_result = await db.execute(select(TrackPoint).filter_by(race_id=race.id).order_by(TrackPoint.point_index))
    points = p_result.scalars().all()
    
    return {
        "track_length": race.track_length,
        "points": [{"x": p.x, "y": p.y, "s": p.s} for p in points]
    }

@router.get("/{season}/{round}/drivers")
async def get_drivers(season: int, round: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = result.scalars().first()
    
    if not race:
         return {"error": "Race not found"}

    d_result = await db.execute(select(Driver).filter_by(race_id=race.id))
    drivers = d_result.scalars().all()
    
    return [
        {
            "driverCode": d.driver_code,
            "team": d.team,
            "teamColor": d.team_color,
            "gridPosition": d.grid_position
        }
        for d in drivers
    ]

@router.get("/{season}/{round}/telemetry/{driver_code}")
async def get_driver_telemetry(season: int, round: int, driver_code: str, db: AsyncSession = Depends(get_db)):
    from app.models import Telemetry
    r_result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = r_result.scalars().first()
    if not race: return Response(content=json.dumps({"error": "Race not found"}), status_code=404)

    d_result = await db.execute(select(Driver).filter_by(race_id=race.id, driver_code=driver_code))
    d = d_result.scalars().first()
    if not d: return Response(content=json.dumps({"error": "Driver not found"}), status_code=404)

    tel_res = await db.execute(
        select(Telemetry.t, Telemetry.speed, Telemetry.rpm, Telemetry.gear, Telemetry.throttle, Telemetry.brake, Telemetry.drs)
        .filter_by(driver_id=d.id).order_by(Telemetry.t)
    )
    
    data = [{
        "t": t_val, "speed": speed, "rpm": rpm, "gear": gear, 
        "throttle": throttle, "brake": brake, "drs": drs,
        "x": 0, "y": 0
    } for t_val, speed, rpm, gear, throttle, brake, drs in tel_res.all()]
    
    return Response(content=json.dumps(data), media_type="application/json")


@router.get("/{season}/{round}/all")
async def get_all_race_data(season: int, round: int, bg: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    from app.models import Position, Telemetry, Lap, PitStop
    r_result = await db.execute(select(Race).filter_by(season=season, round=round))
    race = r_result.scalars().first()
    
    if not race:
        # Create placeholder to prevent duplicate background tasks from polling
        new_race = Race(season=season, round=round, status="processing")
        db.add(new_race)
        await db.commit()
        
        bg.add_task(ingest_race, season, round)
        return {"status": "processing"}
        
    if race.status != "ready": 
        return {"status": race.status}
    
    tp_result = await db.execute(select(TrackPoint.x, TrackPoint.y).filter_by(race_id=race.id).order_by(TrackPoint.point_index))
    tpoints = tp_result.all()
    track_points = [{"x": p.x, "y": p.y} for p in tpoints]
    
    d_result = await db.execute(select(Driver).filter_by(race_id=race.id))
    drivers = d_result.scalars().all()
    driver_ids = [d.id for d in drivers]
    
    # Bulk fetch Positions
    p_res = await db.execute(
        select(Position.driver_id, Position.t, Position.s, Position.lap)
        .filter(Position.driver_id.in_(driver_ids)).order_by(Position.driver_id, Position.t)
    )
    all_positions = p_res.all()
    
    # Bulk fetch Laps
    lap_res = await db.execute(
        select(Lap.driver_id, Lap.lap_number, Lap.start_time)
        .filter(Lap.driver_id.in_(driver_ids)).order_by(Lap.driver_id, Lap.lap_number)
    )
    all_laps = lap_res.all()
    
    # Bulk fetch PitStops
    pit_res = await db.execute(
        select(PitStop.driver_id, PitStop.lap, PitStop.enter_time, PitStop.exit_time)
        .filter(PitStop.driver_id.in_(driver_ids)).order_by(PitStop.driver_id, PitStop.lap)
    )
    all_pits = pit_res.all()
    
    # Group by driver_id in memory
    from collections import defaultdict
    pos_map, lap_map, pit_map = defaultdict(list), defaultdict(list), defaultdict(list)
    
    for d_id, t_val, s_val, lap_val in all_positions:
        pos_map[d_id].append({"t": t_val, "s": s_val, "lap": lap_val})
        
    for d_id, lap, start_t in all_laps:
        lap_map[d_id].append({"lap": lap, "startTime": start_t})
        
    for d_id, lap, enter, exit_t in all_pits:
        pit_map[d_id].append({"lap": lap, "enter": enter, "exit": exit_t})
    
    drivers_dict = {}
    for d in drivers:
        drivers_dict[d.driver_code] = {
            "driverCode": d.driver_code,
            "team": d.team,
            "teamColor": d.team_color,
            "positions": pos_map.get(d.id, []),
            "laps": lap_map.get(d.id, []),
            "pitStops": pit_map.get(d.id, [])
        }
    
    data = {
        "track": {"points": track_points, "length": race.track_length},
        "drivers": drivers_dict
    }
    return Response(content=json.dumps(data), media_type="application/json")

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, insert
from app.core.database import AsyncSessionLocal
from app.models import Race, Driver, Position, Telemetry, Lap, PitStop, TrackPoint
import fastf1
import pandas as pd
import numpy as np
import math
import asyncio

# Configure FastF1 cache
fastf1.Cache.enable_cache("cache")

async def ingest_race(season: int, round: int):
    """
    Ingests race data from FastF1 into the database.
    This function is designed to be run as a background task.
    """
    db = AsyncSessionLocal()
    try:
        print(f"Starting ingestion for {season} round {round}...")
        
        # 1. Load Session
        # We run fastf1 (sync) in a separate thread if needed, but for simplicity here we'll just run it.
        # In a real heavy load scenario, run_in_executor is better.
        loop = asyncio.get_event_loop()
        session = await loop.run_in_executor(None, _load_fastf1_session, season, round)
        
        if not session:
            print(f"Failed to load session for {season} round {round}")
            return

        # 2. Get or Create Race
        result = await db.execute(select(Race).filter_by(season=season, round=round))
        race = result.scalars().first()
        if not race:
            race = Race(season=season, round=round, status="processing")
            db.add(race)
            await db.commit()
            await db.refresh(race)
        else:
            race.status = "processing"
            await db.commit()

        # Update Race Details
        race.circuit_name = session.event.EventName
        race.total_laps = session.total_laps
        
        # 3. Track Geometry
        # Extract track points
        try:
            if not session.laps.empty:
                 fastest_lap = session.laps.pick_fastest()
                 if fastest_lap is not None:
                     # Sync call in executor
                    track_data = await loop.run_in_executor(None, _process_track_geometry, fastest_lap)
                    race.track_length = track_data["length"]
                    
                    # Wipe existing points if re-ingesting? For now, assume fresh or append.
                    # Using bulk insert
                    track_points_objs = [
                        TrackPoint(race_id=race.id, point_index=i, x=p["x"], y=p["y"], s=p["s"])
                        for i, p in enumerate(track_data["points"])
                    ]
                    db.add_all(track_points_objs)
            else:
                print(f"No laps data found for {season} {round}")
        except Exception as e:
             print(f"Error processing track geometry (likely no data): {e}")

        await db.commit()

        # 4. Drivers
        # Sync call
        drivers_data = await loop.run_in_executor(None, _process_drivers, session)
        
        driver_map = {} # driver_code -> db_driver_id
        
        for d_data in drivers_data:
            # Check if driver exists for this race
            d_result = await db.execute(select(Driver).filter_by(race_id=race.id, driver_code=d_data["code"]))
            driver_obj = d_result.scalars().first()
            
            if not driver_obj:
                driver_obj = Driver(
                    race_id=race.id,
                    driver_code=d_data["code"],
                    team=d_data["team"],
                    team_color=d_data["color"],
                    grid_position=int(d_data["grid"]) if not math.isnan(d_data["grid"]) else None
                )
                db.add(driver_obj)
                await db.commit()
                await db.refresh(driver_obj)
            
            driver_map[d_data["code"]] = driver_obj.id

        # 5. Laps, Pitstops, Telemetry, Positions
        # This is the heavy part. We'll do it per driver.
        try:
            if session.laps.empty:
                print("Laps data is empty. Skipping telemetry ingestion.")
                race.status = "failed" # or "no_data"
                await db.commit()
                return

            # We need race start time
            race_start_time = session.laps["LapStartTime"].dropna().min()
            
            drivers_with_data = 0
    
            for driver_code, driver_id in driver_map.items():
                print(f"Processing driver {driver_code}...")
                
                # Laps
                laps = session.laps.pick_driver(driver_code)
                
                lap_objs = []
                pit_objs = []
                
                for _, lap in laps.iterrows():
                    # Lap timing
                    start_t = (lap["LapStartTime"] - race_start_time).total_seconds() if pd.notna(lap["LapStartTime"]) else 0.0
                    lap_time = lap["LapTime"].total_seconds() if pd.notna(lap["LapTime"]) else None
                    
                    lap_objs.append({
                        "driver_id": driver_id,
                        "lap_number": int(lap["LapNumber"]),
                        "start_time": start_t,
                        "lap_time": lap_time,
                        "s1": lap["Sector1Time"].total_seconds() if pd.notna(lap["Sector1Time"]) else None,
                        "s2": lap["Sector2Time"].total_seconds() if pd.notna(lap["Sector2Time"]) else None,
                        "s3": lap["Sector3Time"].total_seconds() if pd.notna(lap["Sector3Time"]) else None,
                    })
                    
                    # Pitstops
                    if pd.notna(lap.get("PitInTime")):
                        enter = (lap["PitInTime"] - race_start_time).total_seconds()
                        exit_t = (lap["PitOutTime"] - race_start_time).total_seconds() if pd.notna(lap.get("PitOutTime")) else None
                        pit_objs.append({
                            "driver_id": driver_id,
                            "lap": int(lap["LapNumber"]),
                            "enter_time": enter,
                            "exit_time": exit_t
                        })
                
                if lap_objs:
                    await db.execute(insert(Lap).values(lap_objs))
                if pit_objs:
                    await db.execute(insert(PitStop).values(pit_objs))
                await db.commit()
    
                # Telemetry & Positions
                # Load telemetry for all laps
                try:
                    # Run heavy FastF1 telemetry unpacking in executor to avoid freezing Uvicorn
                    tel = await loop.run_in_executor(None, laps.get_telemetry)
                    # Run heavy Pandas sorting in executor
                    pos_data, tel_data = await loop.run_in_executor(None, _process_telemetry_batch, tel, race_start_time)
                    
                    # Core insert Telemetry continuously - using native executemany bindings!
                    for r in tel_data: r["driver_id"] = driver_id
                    if tel_data:
                        await db.execute(insert(Telemetry), tel_data)

                    # Core insert Positions continuously
                    for r in pos_data: 
                        r["driver_id"] = driver_id
                        r["lap"] = 0
                    if pos_data:
                        await db.execute(insert(Position), pos_data)
                    
                    # Single network execution
                    await db.commit()
                    drivers_with_data += 1
    
                except Exception as e:
                    print(f"Error processing telemetry for {driver_code}: {e}")
            
            # Done
            if drivers_with_data == 0:
                print("No drivers had valid telemetry data. Marking race as failed.")
                race.status = "failed"
            else:
                race.status = "ready"
            await db.commit()

        except Exception as e:
             print(f"Error accessing laps data: {e}")
             race.status = "failed"
             await db.commit()
        print(f"Ingestion complete for {season} {round}")

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Ingestion failed: {e}")
        if 'race' in locals() and race:
            race.status = "failed"
            await db.commit()
    finally:
        await db.close()

def _load_fastf1_session(season, round):
    try:
        session = fastf1.get_session(season, round, "R") # Race only for now
        session.load()
        return session
    except Exception as e:
        print(f"FastF1 Load Error: {e}")
        return None

def _process_track_geometry(fastest_lap):
    pos = fastest_lap.get_pos_data()
    # Simplified track geometry logic
    # Calculate accumulated distance 's' for x,y path
    # ...
    # Placeholder return
    points = []
    length = 0
    # Todo: Implement proper logic from phase1_track_geometry.py
    # Reusing simple logic:
    track_df = pos[["X", "Y"]].dropna()
    s_acc = 0.0
    prev = None
    for _, row in track_df.iterrows():
        x, y = float(row.X), float(row.Y)
        if prev:
            s_acc += math.hypot(x - prev[0], y - prev[1])
        points.append({"x": round(x, 1), "y": round(y, 1), "s": round(s_acc, 1)})
        prev = (x, y)
    
    return {"length": s_acc, "points": points}

def _process_drivers(session):
    drivers = []
    for d in session.drivers:
        meta = session.get_driver(d)
        # 2023 colors hardcoded or fetched? FastF1 has team colors now usually
        # Fallback map
        # ...
        drivers.append({
            "code": meta["Abbreviation"],
            "team": meta["TeamName"],
            "color": "#FFFFFF", # Placeholder
            "grid": meta["GridPosition"]
        })
    return drivers

def _process_telemetry_batch(tel, start_time):
    # Process dataframe
    tel["TimeSeconds"] = (tel["SessionTime"] - start_time).dt.total_seconds()
    tel = tel.dropna(subset=["TimeSeconds", "Speed", "X", "Y", "Distance"])
    
    # Extract columns as lightning-fast native Python lists
    t_vals = tel["TimeSeconds"].tolist()
    speed_vals = tel["Speed"].tolist()
    throttle_vals = tel["Throttle"].tolist()
    brake_vals = tel["Brake"].tolist()
    gear_vals = tel["nGear"].tolist()
    rpm_vals = tel["RPM"].tolist()
    drs_vals = tel["DRS"].tolist()
    s_vals = tel["Distance"].tolist()
    
    # Telemetry rows
    tel_rows = [
        {"t": t, "speed": s, "throttle": th, "brake": b, "gear": g, "rpm": r, "drs": d}
        for t, s, th, b, g, r, d in zip(t_vals, speed_vals, throttle_vals, brake_vals, gear_vals, rpm_vals, drs_vals)
    ]
    
    # Position rows
    pos_rows = [
        {"t": t, "s": s_dist}
        for t, s_dist in zip(t_vals, s_vals)
    ]
    
    return pos_rows, tel_rows

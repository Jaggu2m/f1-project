from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
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
                    
                    lap_objs.append(Lap(
                        driver_id=driver_id,
                        lap_number=int(lap["LapNumber"]),
                        start_time=start_t,
                        lap_time=lap_time,
                        s1=lap["Sector1Time"].total_seconds() if pd.notna(lap["Sector1Time"]) else None,
                        s2=lap["Sector2Time"].total_seconds() if pd.notna(lap["Sector2Time"]) else None,
                        s3=lap["Sector3Time"].total_seconds() if pd.notna(lap["Sector3Time"]) else None,
                    ))
                    
                    # Pitstops
                    if pd.notna(lap.get("PitInTime")):
                        enter = (lap["PitInTime"] - race_start_time).total_seconds()
                        exit_t = (lap["PitOutTime"] - race_start_time).total_seconds() if pd.notna(lap.get("PitOutTime")) else None
                        pit_objs.append(PitStop(
                            driver_id=driver_id,
                            lap=int(lap["LapNumber"]),
                            enter_time=enter,
                            exit_time=exit_t
                        ))
                
                db.add_all(lap_objs)
                db.add_all(pit_objs)
                await db.commit()
    
                # Telemetry & Positions
                # Load telemetry for all laps
                try:
                    tel = laps.get_telemetry()
                    # Run heavy processing in executor
                    pos_data, tel_data = await loop.run_in_executor(None, _process_telemetry_batch, tel, race_start_time)
                    
                    # Bulk insert Telemetry
                    # Chunking to avoid memory issues
                    CHUNK_SIZE = 1000
                    for i in range(0, len(tel_data), CHUNK_SIZE):
                        chunk = tel_data[i:i+CHUNK_SIZE]
                        db_objs = [
                            Telemetry(
                                driver_id=driver_id,
                                t=row["t"],
                                speed=row["speed"],
                                throttle=row["throttle"],
                                brake=row["brake"],
                                gear=row["gear"],
                                rpm=row["rpm"],
                                drs=row["drs"]
                            ) for row in chunk
                        ]
                        db.add_all(db_objs)
                        await db.commit()
    
                    # Bulk insert Positions
                    for i in range(0, len(pos_data), CHUNK_SIZE):
                        chunk = pos_data[i:i+CHUNK_SIZE]
                        db_objs = [
                            Position(
                                driver_id=driver_id,
                                t=row["t"],
                                s=row["s"],
                                lap=0 # Todo: determine lap from t
                            ) for row in chunk
                        ]
                        db.add_all(db_objs)
                        await db.commit()
    
                except Exception as e:
                    print(f"Error processing telemetry for {driver_code}: {e}")
            
            # Done
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
    
    # Telemetry rows
    tel_rows = []
    pos_rows = []
    
    for _, row in tel.iterrows():
        t = row["TimeSeconds"]
        tel_rows.append({
            "t": t,
            "speed": row["Speed"],
            "throttle": row["Throttle"],
            "brake": row["Brake"],
            "gear": row["nGear"],
            "rpm": row["RPM"],
            "drs": row["DRS"]
        })
        pos_rows.append({
            "t": t,
            "s": row["Distance"]
        })
    
    return pos_rows, tel_rows

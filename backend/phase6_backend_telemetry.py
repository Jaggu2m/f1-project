import fastf1
import json
import math
import pandas as pd
import numpy as np

# =========================
# SETUP
# =========================
fastf1.Cache.enable_cache("cache")

SEASON = 2023
RACE_NAME = "Silverstone"
SESSION = "R"

print(f"Loading Session: {SEASON} {RACE_NAME} {SESSION}...")
session = fastf1.get_session(SEASON, RACE_NAME, SESSION)
session.load()

drivers = session.drivers

# Team Colors (2023)
TEAM_COLORS = {
    "Red Bull Racing": "#1E5BC6",
    "Ferrari": "#DC0000",
    "Mercedes": "#00D2BE",
    "McLaren": "#FF8700",
    "Aston Martin": "#006F62",
    "Alpine": "#0090FF",
    "Williams": "#005AFF",
    "Alfa Romeo": "#900000",
    "AlphaTauri": "#2B4562",
    "Haas F1 Team": "#B6BABD",
}

# =========================
# GLOBAL RACE START TIME
# =========================
race_start_time = session.laps["LapStartTime"].dropna().min()
print(f"Race Start Time: {race_start_time}")

# =========================
# TRACK GEOMETRY
# =========================
print("Extracting Track Geometry...")
fastest_lap = session.laps.pick_fastest()
track_df = fastest_lap.get_pos_data()[["X", "Y"]].dropna()

track = []
s_acc = 0.0

for _, row in track_df.iterrows():
    if track:
        prev = track[-1]
        s_acc += math.hypot(row.X - prev["x"], row.Y - prev["y"])
    track.append({
        "x": round(float(row.X), 1),
        "y": round(float(row.Y), 1),
        "s": round(s_acc, 1)
    })

TRACK_LENGTH = track[-1]["s"]
print(f"Track Length: {TRACK_LENGTH:.2f}m")

# =========================
# OUTPUT STRUCTURE
# =========================
race_data = {
    "track": {
        "points": [{"x": p["x"], "y": p["y"]} for p in track],
        "length": round(TRACK_LENGTH, 1)
    },
    "drivers": {}
}

# =========================
# DRIVER LOOP
# =========================
for driver in drivers:
    laps = session.laps.pick_drivers([driver])
    if laps.empty:
        continue

    meta = session.get_driver(driver)
    driver_code = meta["Abbreviation"]
    team = laps.iloc[0]["Team"]
    team_color = TEAM_COLORS.get(team, "#888888")

    print(f"Processing {driver_code}...")

    telemetry_data = [] # Unified array
    pit_stops = []
    driver_laps = []

    # =========================
    # PROCESS LAPS
    # =========================
    prev_telemetry_t = -1.0
    
    for i, lap in laps.iterrows():
        lap_no = int(lap["LapNumber"])
        
        # 1. Basic Lap Stats
        start_t = 0.0
        if pd.notna(lap["LapStartTime"]):
            start_t = (lap["LapStartTime"] - race_start_time).total_seconds()

        driver_laps.append({
            "lap": lap_no,
            "startTime": round(start_t, 3),
        })

        # 2. Pit Stops
        if pd.notna(lap.get("PitInTime")):
            pit_enter = (lap["PitInTime"] - race_start_time).total_seconds()
            if pd.notna(lap.get("PitOutTime")):
                pit_exit = (lap["PitOutTime"] - race_start_time).total_seconds()
            else:
                pit_exit = pit_enter + 25 
            pit_stops.append({
                "lap": lap_no,
                "enter": round(float(pit_enter), 3),
                "exit": round(float(pit_exit), 3)
            })

        lap_start_time = lap["LapStartTime"]
        if pd.isna(lap_start_time): continue
        
        # --- Telemetry (Unified) ---
        try:
            tel = lap.get_telemetry()
            # Drop NaN for critical fields
            tel = tel.dropna(subset=['Time', 'Speed', 'RPM', 'X', 'Y'])
            
            for _, row in tel.iterrows():
                absolute_time = lap_start_time + row["Time"]
                t = (absolute_time - race_start_time).total_seconds()
                
                # Check Monotonic Time
                if t < prev_telemetry_t:
                    continue
                prev_telemetry_t = t

                telemetry_data.append({
                    "t": round(float(t), 3),
                    "speed": int(row["Speed"]),
                    "rpm": int(row["RPM"]),
                    "gear": int(row["nGear"]),
                    "throttle": int(row["Throttle"]), 
                    "brake": int(row["Brake"]),       
                    "drs": int(row["DRS"]),             
                    "x": round(float(row["X"]), 1),
                    "y": round(float(row["Y"]), 1),
                    "s": 0 # Placeholder, calculated below
                })
                
        except Exception as e:
            print(f"  Error getting telemetry for Lap {lap_no}: {e}")

    # Sort
    telemetry_data.sort(key=lambda p: p["t"])
    
    # Calculate S (Distance) for this driver
    # (Projecting first point then integrating distance)
    if telemetry_data:
        # P0 projection
        p0 = telemetry_data[0]
        min_d = float('inf')
        start_s = 0.0
        
        # Using simplified sampling for projection to save time?
        # Track is optimized points.
        for tp in track: 
            dist = (p0["x"] - tp["x"])**2 + (p0["y"] - tp["y"])**2
            if dist < min_d:
                min_d = dist
                start_s = tp["s"]
                
        current_s = start_s
        telemetry_data[0]["s"] = round(current_s, 1)
        
        prev_x = p0["x"]
        prev_y = p0["y"]
        
        for i in range(1, len(telemetry_data)):
            p = telemetry_data[i]
            dx = p["x"] - prev_x
            dy = p["y"] - prev_y
            dist = math.hypot(dx, dy)
            current_s += dist
            
            p["s"] = round(current_s, 1)
            prev_x = p["x"]
            prev_y = p["y"]
    
    # Store
    race_data["drivers"][driver] = {
        "driverCode": driver_code,
        "team": team,
        "teamColor": team_color,
        "telemetry": telemetry_data, # One unified array
        "pitStops": pit_stops,
        "laps": driver_laps
    }

# =========================
# SAVE JSON
# =========================
output = "frontend/public/race_positions_silverstone_2023_leaderboard2.json"
with open(output, "w") as f:
    json.dump(race_data, f, separators=(',', ':')) # Minimal separators to save space
    
print(f"✅ Optimized Telemetry Data Saved → {output}")

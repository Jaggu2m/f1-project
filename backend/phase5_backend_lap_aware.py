import fastf1
import json
import math
import pandas as pd

# =========================
# SETUP
# =========================
fastf1.Cache.enable_cache("cache")

SEASON = 2023
RACE_NAME = "Silverstone"
SESSION = "R"

session = fastf1.get_session(SEASON, RACE_NAME, SESSION)
session.load()

drivers = session.drivers

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

# =========================
# TRACK GEOMETRY
# =========================
fastest_lap = session.laps.pick_fastest()
track_df = fastest_lap.get_pos_data()[["X", "Y"]].dropna()

track = []
s_acc = 0.0

for _, row in track_df.iterrows():
    if track:
        prev = track[-1]
        s_acc += math.hypot(row.X - prev["x"], row.Y - prev["y"])
    track.append({
        "x": float(row.X),
        "y": float(row.Y),
        "s": s_acc
    })

TRACK_LENGTH = track[-1]["s"]

def project_to_track(x, y):
    best_s = 0.0
    best_d = float("inf")
    for p in track:
        d = (x - p["x"])**2 + (y - p["y"])**2
        if d < best_d:
            best_d = d
            best_s = p["s"]
    return best_s

# =========================
# OUTPUT STRUCTURE
# =========================
race_data = {
    "track": {
        "points": [{"x": p["x"], "y": p["y"]} for p in track],
        "length": TRACK_LENGTH   # 🔥 REQUIRED FOR LEADERBOARD
    },
    "drivers": {}
}

# =========================
# GLOBAL BESTS
# =========================
global_best_s1 = float("inf")
global_best_s2 = float("inf")
global_best_s3 = float("inf")

max_t = 0.0

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

    positions = []
    pit_stops = []
    driver_laps = []

    # =========================
    # LAP DATA & SECTORS
    # =========================
    # We want to store sector times for every completed lap
    driver_best_s1 = float("inf")
    driver_best_s2 = float("inf")
    driver_best_s3 = float("inf")

    for _, lap in laps.iterrows():
        lap_no = int(lap["LapNumber"]) # 1-based
        
        # Extract sector times (Timedelta -> seconds)
        s1 = lap["Sector1Time"].total_seconds() if pd.notna(lap["Sector1Time"]) else None
        s2 = lap["Sector2Time"].total_seconds() if pd.notna(lap["Sector2Time"]) else None
        s3 = lap["Sector3Time"].total_seconds() if pd.notna(lap["Sector3Time"]) else None
        
        # Update Personal Bests
        if s1: driver_best_s1 = min(driver_best_s1, s1)
        if s2: driver_best_s2 = min(driver_best_s2, s2)
        if s3: driver_best_s3 = min(driver_best_s3, s3)

        # Update Global Bests
        if s1: global_best_s1 = min(global_best_s1, s1)
        if s2: global_best_s2 = min(global_best_s2, s2)
        if s3: global_best_s3 = min(global_best_s3, s3)
        
        # Calculate start time relative to race start
        start_t = 0.0
        if pd.notna(lap["LapStartTime"]):
            start_t = (lap["LapStartTime"] - race_start_time).total_seconds()

        driver_laps.append({
            "lap": lap_no,
            "startTime": start_t,
            "s1": s1,
            "s2": s2,
            "s3": s3
        })

    # =========================
    # PIT STOP DETECTION (DEBOUNCED)
    # =========================
    last_pit_in = None

    for _, lap in laps.iterrows():
        pit_in = lap["PitInTime"]
        pit_out = lap["PitOutTime"]

        if pd.notna(pit_in):
            pit_in_sec = (pit_in - race_start_time).total_seconds()

            # Prevent duplicate pit entries
            if last_pit_in is None or pit_in_sec - last_pit_in > 30:
                pit_stops.append({
                    "lap": int(lap["LapNumber"]) - 1,
                    "enter": pit_in_sec,
                    "exit": (
                        (pit_out - race_start_time).total_seconds()
                        if pd.notna(pit_out)
                        else pit_in_sec + 22
                    )
                })
                last_pit_in = pit_in_sec

    # =========================
    # POSITION SAMPLING
    # =========================
    for _, lap in laps.iterrows():
        if pd.isna(lap["LapStartTime"]):
            continue
            
        # ... (rest of sampling logic is fine, just ensure it uses correct lap_no)
        lap_no_0 = int(lap["LapNumber"]) - 1
        lap_start = lap["LapStartTime"]

        pos = lap.get_pos_data()
        if pos is None or pos.empty:
            continue

        pos = pos[["Time", "X", "Y"]].dropna()

        for _, row in pos.iterrows():
            absolute_time = lap_start + row["Time"]
            t = (absolute_time - race_start_time).total_seconds()

            # Continuous race distance
            race_s = lap_no_0 * TRACK_LENGTH + project_to_track(row["X"], row["Y"])

            positions.append({
                "t": float(t),
                "s": float(race_s),
                "lap": lap_no_0
            })

            max_t = max(max_t, t)

    if len(positions) < 2:
        continue

    positions.sort(key=lambda p: p["t"])

    race_data["drivers"][driver] = {
        "driverCode": driver_code,
        "team": team,
        "teamColor": team_color,
        "positions": positions,
        "pitStops": pit_stops,
        "laps": driver_laps,
        "bestSectors": {
            "s1": driver_best_s1 if driver_best_s1 != float("inf") else None,
            "s2": driver_best_s2 if driver_best_s2 != float("inf") else None,
            "s3": driver_best_s3 if driver_best_s3 != float("inf") else None,
        }
    }

    print(
        f"{driver_code}: "
        f"{len(positions)} samples, "
        f"{len(driver_laps)} laps recorded"
    )

# Add Global Bests to Root
race_data["bestSectors"] = {
    "s1": global_best_s1 if global_best_s1 != float("inf") else None,
    "s2": global_best_s2 if global_best_s2 != float("inf") else None,
    "s3": global_best_s3 if global_best_s3 != float("inf") else None
}

# =========================
# SAVE JSON
# =========================
output = "frontend/public/race_positions_silverstone_2023_leaderboard2.json"
with open(output, "w") as f:
    json.dump(race_data, f)
    
print(f"✅ Leaderboard-ready race data saved → {output}")
print(f"🏁 Race duration: {round(max_t, 1)} seconds")
print(f"🟣 Global Best Sectors: S1={global_best_s1:.3f}, S2={global_best_s2:.3f}, S3={global_best_s3:.3f}")

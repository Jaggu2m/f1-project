import fastf1
import json
import math
import pandas as pd

fastf1.Cache.enable_cache("cache")

SEASON = 2023
RACE_NAME = "Monaco"
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

# 🔑 GLOBAL RACE START TIME
race_start_time = session.laps["LapStartTime"].dropna().min()

# ============================
# TRACK GEOMETRY
# ============================
fastest_lap = session.laps.pick_fastest()
track_df = fastest_lap.get_pos_data()[["X", "Y"]].dropna()

track = []
s_acc = 0.0

for _, row in track_df.iterrows():
    if track:
        prev = track[-1]
        s_acc += math.hypot(row.X - prev["x"], row.Y - prev["y"])
    track.append({"x": float(row.X), "y": float(row.Y), "s": s_acc})

TRACK_LENGTH = track[-1]["s"]

def project_to_track(x, y):
    best_s = 0
    best_d = float("inf")
    for p in track:
        d = (x - p["x"])**2 + (y - p["y"])**2
        if d < best_d:
            best_d = d
            best_s = p["s"]
    return best_s

race_data = {
    "track": {
        "points": [{"x": p["x"], "y": p["y"]} for p in track]
    },
    "drivers": {}
}

max_t = 0.0

for driver in drivers:
    laps = session.laps.pick_driver(driver)
    if laps.empty:
        continue

    meta = session.get_driver(driver)
    driver_code = meta["Abbreviation"]

    team = laps.iloc[0]["Team"]
    team_color = TEAM_COLORS.get(team, "#888888")

    positions = []

    for _, lap in laps.iterrows():
        if pd.isna(lap["LapStartTime"]):
            continue

        lap_no = int(lap["LapNumber"]) - 1
        lap_start = lap["LapStartTime"]

        pos = lap.get_pos_data()
        if pos is None or pos.empty:
            continue

        pos = pos[["Time", "X", "Y"]].dropna()

        for _, row in pos.iterrows():
            absolute_time = lap_start + row["Time"]
            t = (absolute_time - race_start_time).total_seconds()

            s = lap_no * TRACK_LENGTH + project_to_track(row["X"], row["Y"])

            positions.append({
                "t": float(t),
                "s": float(s),
                "lap": lap_no
            })

            max_t = max(max_t, t)

    if len(positions) < 2:
        continue

    positions.sort(key=lambda p: p["t"])

    race_data["drivers"][driver] = {
        "driverCode": driver_code,
        "team": team,
        "teamColor": team_color,
        "positions": positions
    }

    print(f"{driver_code}: {len(positions)} samples, {positions[-1]['lap']+1} laps")

with open("race_positions_monaco_2023_lapaware.json", "w") as f:
    json.dump(race_data, f)

print(f"✅ Phase-5 lap-aware race data saved → race_positions_monaco_2023_lapaware.json")
print(f"🏁 Race duration: {round(max_t, 1)} seconds")

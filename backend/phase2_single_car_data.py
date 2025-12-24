import fastf1
import pandas as pd

fastf1.Cache.enable_cache("cache")

# Load session
session = fastf1.get_session(2023, "Monza", "R")
session.load()

# One driver, fastest lap
laps = session.laps.pick_driver("VER")
lap = laps.pick_fastest()

# Position data with time
pos = lap.get_pos_data()[["Time", "X", "Y"]].dropna()

# Convert Time to seconds (float) for frontend simplicity
pos["t"] = pos["Time"].dt.total_seconds()

# Keep only what we need
out = pos[["t", "X", "Y"]]

out.to_csv("single_car_positions_monza.csv", index=False)
print("Saved", len(out), "points")

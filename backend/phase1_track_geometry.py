import fastf1
import pandas as pd

# Enable cache
fastf1.Cache.enable_cache("cache")

# Load session
session = fastf1.get_session(2023, "Monza", "R")
session.load()

# Pick driver & fastest lap
laps = session.laps.pick_driver("VER")
lap = laps.pick_fastest()

# Extract position data
pos = lap.get_pos_data()

# Keep only X, Y
track_points = pos[['X', 'Y']].dropna()

# Save for frontend
track_points.to_csv("track_geometry_monza.csv", index=False)

print("Track geometry saved:", len(track_points), "points")

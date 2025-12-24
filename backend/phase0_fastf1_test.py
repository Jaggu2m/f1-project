import fastf1

fastf1.Cache.enable_cache("cache")

session = fastf1.get_session(2023, "Monza", "R")
session.load()

driver = "VER"
laps = session.laps.pick_driver(driver)

print(laps[["LapNumber", "LapTime", "Compound", "Stint"]].head())

lap = laps.pick_fastest()

print("Fastest Lap:", lap["LapTime"])
print("Sector 1:", lap["Sector1Time"])
print("Sector 2:", lap["Sector2Time"])
print("Sector 3:", lap["Sector3Time"])

telemetry = lap.get_car_data()

print(telemetry.head())
print("Telemetry columns:", telemetry.columns)

pos = lap.get_pos_data()

print(pos.head())
print("Position columns:", pos.columns)

print("Telemetry start:", telemetry["Time"].min())
print("Telemetry end:", telemetry["Time"].max())

print("Position start:", pos["Time"].min())
print("Position end:", pos["Time"].max())

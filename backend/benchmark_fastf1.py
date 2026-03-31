import time
import fastf1

fastf1.Cache.enable_cache("cache")

def benchmark():
    t0 = time.time()
    session = fastf1.get_session(2021, 2, 'R')
    session.load()
    t1 = time.time()
    print(f"session.load() took {t1 - t0:.2f}s")
    
    t0 = time.time()
    drivers = session.drivers
    t_tel = 0
    import pandas as pd
    for d in drivers[:3]: # Only test 3 drivers
        tt0 = time.time()
        laps = session.laps.pick_driver(d)
        tel = laps.get_telemetry()
        t_tel += (time.time() - tt0)
        print(f"Driver {d} get_telemetry took {time.time() - tt0:.2f}s")
    
    print(f"Average get_telemetry() per driver: {t_tel/3:.2f}s")
    print(f"Projected total for 20 drivers: {(t_tel/3)*20:.2f}s")

if __name__ == "__main__":
    benchmark()

import time
import fastf1
from concurrent.futures import ProcessPoolExecutor

fastf1.Cache.enable_cache("cache")

def process_driver_isolated(args):
    season, round, driver_code = args
    import fastf1
    fastf1.Cache.enable_cache("cache")
    session = fastf1.get_session(season, round, 'R')
    session.load(telemetry=True, weather=False, messages=False)
    
    laps = session.laps.pick_driver(driver_code)
    try:
        tel = laps.get_telemetry()
        # Return length as dummy variable to prove success
        return len(tel)
    except Exception as e:
        return 0

def benchmark():
    session = fastf1.get_session(2021, 2, 'R')
    session.load() # Preach the cache synchronously 
    drivers = session.drivers[:4]
    
    t0 = time.time()
    args_list = [(2021, 2, d) for d in drivers]
    
    with ProcessPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(process_driver_isolated, args_list))
    
    print(f"Multiprocessing 4 drivers took: {time.time() - t0:.2f}s")
    print(f"Results: {results}")

if __name__ == "__main__":
    benchmark()

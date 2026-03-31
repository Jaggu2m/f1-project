import time
import fastf1
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor

fastf1.Cache.enable_cache("cache")

def process_driver(args):
    session, d = args
    laps = session.laps.pick_driver(d)
    tel = laps.get_telemetry() # Intensive
    return len(tel)

def process_driver_thread(session, d):
    try:
        laps = session.laps.pick_driver(d)
        tel = laps.get_telemetry()
        return len(tel)
    except Exception as e:
        return 0

def benchmark():
    session = fastf1.get_session(2021, 2, 'R')
    session.load()
    
    drivers = session.drivers[:5] # Test 5 drivers
    print(f"Testing {len(drivers)} drivers...")
    
    # 1. Sequential
    t0 = time.time()
    for d in drivers:
        process_driver_thread(session, d)
    print(f"Sequential: {time.time() - t0:.2f}s")
    
    # 2. Threads
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=5) as pool:
        list(pool.map(lambda d: process_driver_thread(session, d), drivers))
    print(f"ThreadPool: {time.time() - t0:.2f}s")

if __name__ == "__main__":
    benchmark()

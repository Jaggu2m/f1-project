import time
import fastf1

fastf1.Cache.enable_cache("cache")

def benchmark():
    session = fastf1.get_session(2021, 2, 'R')
    session.load()
    
    print("Testing Vectorized getting all telemetry at once...")
    t0 = time.time()
    try:
        # Load telemetry for ALL laps across ALL drivers at once
        tel = session.laps.get_telemetry()
        print(f"Vectorized Time: {time.time() - t0:.2f}s")
        print(f"Total Rows: {len(tel)}")
    except Exception as e:
        print(f"Vectorized Error: {e}")

if __name__ == "__main__":
    benchmark()

import fastf1
import sys

def test_load(season, round):
    print(f"Testing load for {season} round {round}...")
    try:
        session = fastf1.get_session(season, round, "R")
        session.load()
        
        print("Session loaded.")
        
        try:
            print(f"Laps: {len(session.laps)}")
            fastest = session.laps.pick_fastest()
            print(f"Fastest Lap: {fastest}")
        except Exception as e:
            print(f"Error accessing laps: {e}")

    except Exception as e:
        print(f"Error loading session: {e}")

if __name__ == "__main__":
    # Brazilian GP 2010 is Round 18
    test_load(2010, 18)

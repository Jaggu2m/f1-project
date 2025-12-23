from fastapi import FastAPI
import fastf1

# Enable FastF1 cache
fastf1.Cache.enable_cache("cache")

# Create FastAPI app (THIS WAS MISSING)
app = FastAPI()

@app.get("/")
def root():
    return {"status": "FastAPI + FastF1 cache working"}

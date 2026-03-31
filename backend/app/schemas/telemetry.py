from pydantic import BaseModel

class TelemetryBase(BaseModel):
    t: float
    speed: float
    throttle: float
    brake: float
    gear: int
    rpm: float
    drs: int

class Telemetry(TelemetryBase):
    driver_id: int

    class Config:
        from_attributes = True

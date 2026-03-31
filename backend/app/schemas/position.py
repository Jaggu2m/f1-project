from pydantic import BaseModel

class PositionBase(BaseModel):
    t: float
    s: float
    lap: int

class Position(PositionBase):
    driver_code: str  # Flattened for response if needed, or structured
    # id: int        # Usually not sent in stream

    class Config:
        from_attributes = True

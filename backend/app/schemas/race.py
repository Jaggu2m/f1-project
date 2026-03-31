from pydantic import BaseModel
from typing import Optional, List

class RaceBase(BaseModel):
    season: int
    round: int
    circuit_name: Optional[str] = None
    total_laps: Optional[int] = None
    track_length: Optional[float] = None
    status: Optional[str] = "processing"

class RaceCreate(RaceBase):
    pass

class Race(RaceBase):
    id: int

    class Config:
        from_attributes = True

from pydantic import BaseModel
from typing import Optional

class DriverBase(BaseModel):
    driver_code: str
    team: Optional[str] = None
    team_color: Optional[str] = None
    grid_position: Optional[int] = None

class Driver(DriverBase):
    id: int
    race_id: int

    class Config:
        from_attributes = True

from sqlalchemy import Column, Integer, String, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import Base

class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    race_id = Column(Integer, ForeignKey("races.id"))
    driver_code = Column(String, index=True)
    team = Column(String)
    team_color = Column(String)
    grid_position = Column(Integer)

    race = relationship("Race", back_populates="drivers")
    positions = relationship("Position", back_populates="driver")
    telemetry = relationship("Telemetry", back_populates="driver")
    laps = relationship("Lap", back_populates="driver")
    pit_stops = relationship("PitStop", back_populates="driver")

    __table_args__ = (
        Index('idx_driver_race_code', 'race_id', 'driver_code'),
    )

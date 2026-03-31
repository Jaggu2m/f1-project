from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class PitStop(Base):
    __tablename__ = "pit_stops"

    id = Column(Integer, primary_key=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"))
    lap = Column(Integer)
    enter_time = Column(Float)
    exit_time = Column(Float)

    driver = relationship("Driver", back_populates="pit_stops")

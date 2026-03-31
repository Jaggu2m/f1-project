from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Lap(Base):
    __tablename__ = "laps"

    id = Column(Integer, primary_key=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"))
    lap_number = Column(Integer)
    start_time = Column(Float) # Seconds from race start? Or absolute? Assuming relative t
    s1 = Column(Float)
    s2 = Column(Float)
    s3 = Column(Float)
    lap_time = Column(Float)

    driver = relationship("Driver", back_populates="laps")

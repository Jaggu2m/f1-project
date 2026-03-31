from sqlalchemy import Column, Integer, Float, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import Base

class Telemetry(Base):
    __tablename__ = "telemetry"

    id = Column(Integer, primary_key=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"))
    t = Column(Float)
    speed = Column(Float)
    throttle = Column(Float)
    brake = Column(Float)
    gear = Column(Integer)
    rpm = Column(Float)
    drs = Column(Integer)

    driver = relationship("Driver", back_populates="telemetry")

    __table_args__ = (
        Index('idx_telemetry_driver_t', 'driver_id', 't'),
    )

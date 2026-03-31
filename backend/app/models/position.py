from sqlalchemy import Column, Integer, Float, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import Base

class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"))
    t = Column(Float)
    s = Column(Float)
    lap = Column(Integer)

    driver = relationship("Driver", back_populates="positions")

    __table_args__ = (
        Index('idx_positions_driver_t', 'driver_id', 't'),
        Index('idx_positions_driver_s', 'driver_id', 's'),
    )

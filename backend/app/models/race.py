from sqlalchemy import Column, Integer, String, Float, Index
from sqlalchemy.orm import relationship
from app.core.database import Base

class Race(Base):
    __tablename__ = "races"

    id = Column(Integer, primary_key=True, index=True)
    season = Column(Integer, nullable=False)
    round = Column(Integer, nullable=False)
    circuit_name = Column(String)
    total_laps = Column(Integer)
    track_length = Column(Float)
    status = Column(String, default="processing")  # processing | ready | failed

    drivers = relationship("Driver", back_populates="race")
    track_points = relationship("TrackPoint", back_populates="race")
    
    __table_args__ = (
        Index('idx_race_season_round', 'season', 'round', unique=True),
    )

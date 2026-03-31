from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class TrackPoint(Base):
    __tablename__ = "track_points"

    id = Column(Integer, primary_key=True)
    race_id = Column(Integer, ForeignKey("races.id"))
    point_index = Column(Integer)
    x = Column(Float)
    y = Column(Float)
    s = Column(Float)

    race = relationship("Race", back_populates="track_points")

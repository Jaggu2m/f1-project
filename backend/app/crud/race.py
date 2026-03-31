from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Race
from app.schemas import RaceCreate

async def get_race(db: AsyncSession, season: int, round: int):
    result = await db.execute(select(Race).filter_by(season=season, round=round))
    return result.scalars().first()

async def create_race(db: AsyncSession, race: RaceCreate):
    db_race = Race(**race.model_dump())
    db.add(db_race)
    await db.commit()
    await db.refresh(db_race)
    return db_race

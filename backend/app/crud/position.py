from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Position

async def get_positions(db: AsyncSession, driver_id: int, t: float):
    query = (
        select(Position)
        .filter(Position.driver_id == driver_id, Position.t <= t)
        .order_by(Position.t.desc())
        .limit(1)
    )
    result = await db.execute(query)
    return result.scalars().first()

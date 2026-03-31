from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models import Telemetry

async def get_telemetry(db: AsyncSession, driver_id: int, start: float, end: float):
    query = (
        select(Telemetry)
        .filter(
            Telemetry.driver_id == driver_id,
            Telemetry.t >= start,
            Telemetry.t <= end
        )
        .order_by(Telemetry.t.asc())
    )
    result = await db.execute(query)
    return result.scalars().all()

"""Retroactively fix driver colors in the database using the fallback dictionary."""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy.future import select
from app.core.database import AsyncSessionLocal
from app.models.driver import Driver

TEAM_COLORS_FALLBACK = {
    "Red Bull Racing": "#3671C6",
    "Ferrari": "#E8002D",
    "Mercedes": "#27F4D2",
    "McLaren": "#FF8000",
    "Aston Martin": "#229971",
    "Alpine": "#0093CC",
    "Williams": "#64C4FF",
    "Alfa Romeo": "#C92D4B",
    "AlphaTauri": "#5E8FAA",
    "Haas F1 Team": "#B6BABD",
    "Kick Sauber": "#52E252",
    "Visa Cash App RB": "#6692FF",
    "Racing Bulls": "#6692FF"
}

async def main():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Driver))
        drivers = result.scalars().all()
        updates = 0
        for d in drivers:
            if not d.team:
                continue
            new_color = TEAM_COLORS_FALLBACK.get(d.team, "#888888")
            if d.team_color != new_color:
                print(f"  {d.driver_code} ({d.team}): {d.team_color} -> {new_color}")
                d.team_color = new_color
                updates += 1

        if updates > 0:
            await db.commit()
        print(f"\nUpdated {updates} driver colors in the database!")

if __name__ == "__main__":
    asyncio.run(main())

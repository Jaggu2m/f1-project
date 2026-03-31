from fastapi import APIRouter
from app.api import race, position, telemetry

router = APIRouter()

# Note: The user requested structure like /race/{season}/{round}
# So race router handles /race prefix?
# Or we structure it here.

router.include_router(race.router, prefix="/race", tags=["Race"])
router.include_router(position.router, tags=["Position"])   # /race/.../positions handled inside?
router.include_router(telemetry.router, tags=["Telemetry"]) # /race/.../telemetry handled inside?

# Wait, the paths in position.py and telemetry.py are absolute /race/...
# So we should just include them.

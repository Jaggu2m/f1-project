from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware
from app.api import router as api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Connect to DB (Connection pool created in engine)
    # Tables are now managed by Alembic, so we don't create them here.
    yield
    # Shutdown logic if needed

app = FastAPI(lifespan=lifespan, title="F1 Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.get("/")
def root():
    return {"status": "F1 Backend Running"}

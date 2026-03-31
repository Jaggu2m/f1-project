import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    PROJECT_NAME: str = "F1 Backend"

settings = Settings()

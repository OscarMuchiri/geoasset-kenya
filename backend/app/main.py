from fastapi import FastAPI
from sqlalchemy import text

from .db import engine
from .routes.assets import router as assets_router


app = FastAPI(
    title="GeoAsset Kenya API",
    description="Spatial API for Kenya electricity infrastructure asset management.",
    version="0.2.0",
)

app.include_router(assets_router)


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    return {"name": "GeoAsset Kenya API", "status": "running"}


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}

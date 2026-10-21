from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .db import engine
from .routes.assets import router as assets_router
from .routes.network import router as network_router
from .routes.analytics import router as analytics_router
from .routes.operations import router as operations_router


app = FastAPI(
    title="GeoAsset Kenya API",
    description="Spatial API for Kenya electricity infrastructure asset management.",
    version="0.4.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(assets_router)
app.include_router(network_router)
app.include_router(analytics_router)
app.include_router(operations_router)


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    return {"name": "GeoAsset Kenya API", "status": "running"}


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}

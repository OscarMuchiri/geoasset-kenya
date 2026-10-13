from fastapi import FastAPI

app = FastAPI(
    title="GeoAsset Kenya API",
    description="Spatial API for Kenya electricity infrastructure asset management.",
    version="0.1.0",
)


@app.get("/", tags=["system"])
def root() -> dict[str, str]:
    return {"name": "GeoAsset Kenya API", "status": "running"}


@app.get("/health", tags=["system"])
def health() -> dict[str, str]:
    return {"status": "ok"}

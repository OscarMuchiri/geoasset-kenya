from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db


router = APIRouter(prefix="/network-lines", tags=["network"])


@router.get("")
def list_network_lines(
    voltage_kv: float | None = None,
    network_class: str | None = None,
    min_lon: float | None = Query(None, ge=-180, le=180),
    min_lat: float | None = Query(None, ge=-90, le=90),
    max_lon: float | None = Query(None, ge=-180, le=180),
    max_lat: float | None = Query(None, ge=-90, le=90),
    limit: int = Query(5000, ge=1, le=10000),
    db: Session = Depends(get_db),
) -> dict:
    clauses: list[str] = []
    params: dict[str, object] = {"limit": limit}

    if voltage_kv is not None:
        clauses.append("voltage_kv = :voltage_kv")
        params["voltage_kv"] = voltage_kv

    if network_class:
        clauses.append("network_class = :network_class")
        params["network_class"] = network_class

    bbox = (min_lon, min_lat, max_lon, max_lat)
    if any(value is not None for value in bbox):
        if not all(value is not None for value in bbox):
            raise HTTPException(status_code=422, detail="Provide all bbox values together.")
        clauses.append(
            "geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)"
        )
        params.update(
            {
                "min_lon": min_lon,
                "min_lat": min_lat,
                "max_lon": max_lon,
                "max_lat": max_lat,
            }
        )

    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    rows = db.execute(
        text(
            """
            SELECT
                id::text AS id,
                source_id,
                name,
                voltage_kv,
                network_class,
                source_name,
                source_license,
                source_properties,
                ST_AsGeoJSON(geom)::json AS geometry
            FROM network_lines
            """
            + where
            + " ORDER BY network_class, id LIMIT :limit"
        ),
        params,
    ).mappings().all()

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": row["id"],
                "geometry": row["geometry"],
                "properties": {
                    "source_id": row["source_id"],
                    "name": row["name"],
                    "voltage_kv": row["voltage_kv"],
                    "network_class": row["network_class"],
                    "source_name": row["source_name"],
                    "source_license": row["source_license"],
                    "source_properties": row["source_properties"],
                },
            }
            for row in rows
        ],
        "meta": {"count": len(rows), "limit": limit},
    }


@router.get("/classes")
def list_network_classes(db: Session = Depends(get_db)) -> dict:
    rows = db.execute(
        text(
            """
            SELECT network_class, voltage_kv, COUNT(*) AS feature_count
            FROM network_lines
            GROUP BY network_class, voltage_kv
            ORDER BY voltage_kv NULLS LAST, network_class
            """
        )
    ).mappings().all()
    return {"classes": [dict(row) for row in rows]}

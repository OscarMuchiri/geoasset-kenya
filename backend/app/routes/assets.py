from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db


router = APIRouter(prefix="/assets", tags=["assets"])


BASE_SELECT = """
SELECT
    a.id::text AS id,
    a.source_id,
    at.code AS asset_type,
    at.name AS asset_type_name,
    a.name,
    a.voltage_kv,
    a.region,
    a.service_area,
    a.branch,
    a.asset_reference,
    a.feeder,
    a.origin_area,
    a.asset_structure,
    a.dcs_category,
    a.installation_environment,
    a.isolation_type,
    a.road_name,
    a.street_name,
    a.location_description,
    a.status,
    a.condition,
    a.maintenance_priority,
    a.source_name,
    a.source_license,
    a.source_properties,
    ST_X(a.geom) AS longitude,
    ST_Y(a.geom) AS latitude
FROM assets a
JOIN asset_types at ON at.id = a.asset_type_id
"""


@router.get("")
def list_assets(
    asset_type: str | None = None,
    service_area: str | None = None,
    branch: str | None = None,
    feeder: str | None = None,
    min_lon: float | None = Query(None, ge=-180, le=180),
    min_lat: float | None = Query(None, ge=-90, le=90),
    max_lon: float | None = Query(None, ge=-180, le=180),
    max_lat: float | None = Query(None, ge=-90, le=90),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    clauses: list[str] = []
    params: dict[str, object] = {"limit": limit, "offset": offset}

    if asset_type:
        clauses.append("at.code = :asset_type")
        params["asset_type"] = asset_type

    if service_area:
        clauses.append("a.service_area = :service_area")
        params["service_area"] = service_area

    if branch:
        clauses.append("a.branch = :branch")
        params["branch"] = branch

    if feeder:
        clauses.append("a.feeder = :feeder")
        params["feeder"] = feeder

    bbox_values = (min_lon, min_lat, max_lon, max_lat)
    if any(value is not None for value in bbox_values):
        if not all(value is not None for value in bbox_values):
            raise HTTPException(
                status_code=422,
                detail="Provide min_lon, min_lat, max_lon and max_lat together.",
            )
        if min_lon >= max_lon or min_lat >= max_lat:
            raise HTTPException(status_code=422, detail="Invalid bounding box.")

        clauses.append(
            "a.geom && ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)"
        )
        params.update(
            {
                "min_lon": min_lon,
                "min_lat": min_lat,
                "max_lon": max_lon,
                "max_lat": max_lat,
            }
        )

    where_sql = " WHERE " + " AND ".join(clauses) if clauses else ""
    query = text(
        BASE_SELECT
        + where_sql
        + " ORDER BY a.created_at DESC LIMIT :limit OFFSET :offset"
    )

    rows = db.execute(query, params).mappings().all()

    features = [
        {
            "type": "Feature",
            "id": row["id"],
            "geometry": {
                "type": "Point",
                "coordinates": [row["longitude"], row["latitude"]],
            },
            "properties": {
                key: row[key]
                for key in (
                    "source_id",
                    "asset_type",
                    "asset_type_name",
                    "name",
                    "voltage_kv",
                    "region",
                    "service_area",
                    "branch",
                    "asset_reference",
                    "feeder",
                    "origin_area",
                    "asset_structure",
                    "dcs_category",
                    "installation_environment",
                    "isolation_type",
                    "road_name",
                    "street_name",
                    "location_description",
                    "status",
                    "condition",
                    "maintenance_priority",
                    "source_name",
                    "source_license",
                    "source_properties",
                )
            },
        }
        for row in rows
    ]

    return {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "count": len(features),
            "limit": limit,
            "offset": offset,
        },
    }


@router.get("/filter-options")
def get_filter_options(db: Session = Depends(get_db)) -> dict:
    service_areas = db.execute(
        text(
            """
            SELECT DISTINCT service_area
            FROM assets
            WHERE service_area IS NOT NULL AND service_area <> ''
            ORDER BY service_area
            """
        )
    ).scalars().all()

    branches = db.execute(
        text(
            """
            SELECT DISTINCT branch
            FROM assets
            WHERE branch IS NOT NULL AND branch <> ''
            ORDER BY branch
            """
        )
    ).scalars().all()

    feeders = db.execute(
        text(
            """
            SELECT DISTINCT feeder
            FROM assets
            WHERE feeder IS NOT NULL AND feeder <> ''
            ORDER BY feeder
            """
        )
    ).scalars().all()

    return {
        "service_areas": service_areas,
        "branches": branches,
        "feeders": feeders,
    }


@router.get("/{asset_id}")
def get_asset(asset_id: UUID, db: Session = Depends(get_db)) -> dict:
    query = text(BASE_SELECT + " WHERE a.id = :asset_id")
    row = db.execute(query, {"asset_id": str(asset_id)}).mappings().first()

    if row is None:
        raise HTTPException(status_code=404, detail="Asset not found.")

    return {
        "type": "Feature",
        "id": row["id"],
        "geometry": {
            "type": "Point",
            "coordinates": [row["longitude"], row["latitude"]],
        },
        "properties": {
            key: row[key]
            for key in (
                "source_id",
                "asset_type",
                "asset_type_name",
                "name",
                "voltage_kv",
                "region",
                "service_area",
                "branch",
                    "asset_reference",
                "feeder",
                "origin_area",
                "asset_structure",
                "dcs_category",
                "installation_environment",
                "isolation_type",
                "road_name",
                "street_name",
                "location_description",
                "status",
                "condition",
                "maintenance_priority",
                "source_name",
                "source_license",
                "source_properties",
            )
        },
    }

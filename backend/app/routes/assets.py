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
    status: str | None = None,
    condition: str | None = None,
    maintenance_priority: str | None = None,
    q: str | None = Query(None, min_length=2, max_length=120),
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

    if status:
        clauses.append("a.status = :status")
        params["status"] = status

    if condition:
        clauses.append("a.condition = :condition")
        params["condition"] = condition

    if maintenance_priority:
        clauses.append("a.maintenance_priority = :maintenance_priority")
        params["maintenance_priority"] = maintenance_priority

    if q:
        clauses.append(
            """
            (
                a.asset_reference ILIKE :q
                OR a.feeder ILIKE :q
                OR a.road_name ILIKE :q
                OR a.street_name ILIKE :q
                OR a.location_description ILIKE :q
                OR a.branch ILIKE :q
                OR a.service_area ILIKE :q
            )
            """
        )
        params["q"] = f"%{q.strip()}%"

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
                "asset_id": row["id"],
                **{
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
                }
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
def get_filter_options(
    service_area: str | None = None,
    branch: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
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

    branch_params: dict[str, object] = {}
    branch_where = ""
    if service_area:
        branch_where = " AND service_area = :service_area"
        branch_params["service_area"] = service_area

    branches = db.execute(
        text(
            """
            SELECT DISTINCT branch
            FROM assets
            WHERE branch IS NOT NULL AND branch <> ''
            """ + branch_where + """
            ORDER BY branch
            """
        ),
        branch_params,
    ).scalars().all()

    feeder_params: dict[str, object] = {}
    feeder_clauses = ["feeder IS NOT NULL", "feeder <> ''"]

    if service_area:
        feeder_clauses.append("service_area = :service_area")
        feeder_params["service_area"] = service_area

    if branch:
        feeder_clauses.append("branch = :branch")
        feeder_params["branch"] = branch

    feeders = db.execute(
        text(
            "SELECT DISTINCT feeder FROM assets WHERE "
            + " AND ".join(feeder_clauses)
            + " ORDER BY feeder"
        ),
        feeder_params,
    ).scalars().all()

    return {
        "service_areas": service_areas,
        "branches": branches,
        "feeders": feeders,
    }


@router.get("/bounds")
def get_asset_bounds(
    asset_type: str = "distribution_transformer",
    service_area: str | None = None,
    branch: str | None = None,
    feeder: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    clauses = ["at.code = :asset_type"]
    params: dict[str, object] = {"asset_type": asset_type}

    if service_area:
        clauses.append("a.service_area = :service_area")
        params["service_area"] = service_area

    if branch:
        clauses.append("a.branch = :branch")
        params["branch"] = branch

    if feeder:
        clauses.append("a.feeder = :feeder")
        params["feeder"] = feeder

    row = db.execute(
        text(
            """
            SELECT
                ST_XMin(extent) AS min_lon,
                ST_YMin(extent) AS min_lat,
                ST_XMax(extent) AS max_lon,
                ST_YMax(extent) AS max_lat
            FROM (
                SELECT ST_Extent(a.geom) AS extent
                FROM assets a
                JOIN asset_types at ON at.id = a.asset_type_id
                WHERE """
            + " AND ".join(clauses)
            + """
            ) scoped
            """
        ),
        params,
    ).mappings().one()

    if row["min_lon"] is None:
        raise HTTPException(status_code=404, detail="No assets found for this scope.")

    return {
        "min_lon": float(row["min_lon"]),
        "min_lat": float(row["min_lat"]),
        "max_lon": float(row["max_lon"]),
        "max_lat": float(row["max_lat"]),
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
            "asset_id": row["id"],
            **{
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
            }
        },
    }

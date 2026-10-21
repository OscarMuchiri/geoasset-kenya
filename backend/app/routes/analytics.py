from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import get_db


router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
def analytics_summary(
    service_area: str | None = None,
    branch: str | None = None,
    feeder: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    transformer_clauses = ["at.code = 'distribution_transformer'"]
    transformer_params: dict[str, object] = {}

    if service_area:
        transformer_clauses.append("a.service_area = :service_area")
        transformer_params["service_area"] = service_area

    if branch:
        transformer_clauses.append("a.branch = :branch")
        transformer_params["branch"] = branch

    if feeder:
        transformer_clauses.append("a.feeder = :feeder")
        transformer_params["feeder"] = feeder

    transformer_where = " AND ".join(transformer_clauses)

    transformer_scope = db.execute(
        text(
            f"""
            SELECT COUNT(*)
            FROM assets a
            JOIN asset_types at ON at.id = a.asset_type_id
            WHERE {transformer_where}
            """
        ),
        transformer_params,
    ).scalar_one()

    footprint = db.execute(
        text(
            """
            SELECT
                COUNT(DISTINCT NULLIF(service_area, '')) AS service_areas,
                COUNT(DISTINCT NULLIF(branch, '')) AS branches,
                COUNT(DISTINCT NULLIF(feeder, '')) AS feeders
            FROM assets a
            JOIN asset_types at ON at.id = a.asset_type_id
            WHERE at.code = 'distribution_transformer'
            """
        )
    ).mappings().one()

    stations = db.execute(
        text(
            """
            SELECT COUNT(*)
            FROM assets a
            JOIN asset_types at ON at.id = a.asset_type_id
            WHERE at.code = 'transmission_station'
            """
        )
    ).scalar_one()

    network_rows = db.execute(
        text(
            """
            SELECT
                network_class,
                voltage_kv,
                COUNT(*) AS feature_count,
                ROUND((SUM(ST_Length(geom::geography)) / 1000.0)::numeric, 1) AS length_km
            FROM network_lines
            GROUP BY network_class, voltage_kv
            ORDER BY voltage_kv NULLS LAST, network_class
            """
        )
    ).mappings().all()

    top_service_areas = db.execute(
        text(
            """
            SELECT a.service_area AS label, COUNT(*) AS value
            FROM assets a
            JOIN asset_types at ON at.id = a.asset_type_id
            WHERE at.code = 'distribution_transformer'
              AND a.service_area IS NOT NULL
              AND a.service_area <> ''
            GROUP BY a.service_area
            ORDER BY value DESC, a.service_area
            LIMIT 5
            """
        )
    ).mappings().all()

    top_branches_clauses = [
        "at.code = 'distribution_transformer'",
        "a.branch IS NOT NULL",
        "a.branch <> ''",
    ]
    top_branch_params: dict[str, object] = {}

    if service_area:
        top_branches_clauses.append("a.service_area = :service_area")
        top_branch_params["service_area"] = service_area

    top_branches = db.execute(
        text(
            f"""
            SELECT a.branch AS label, COUNT(*) AS value
            FROM assets a
            JOIN asset_types at ON at.id = a.asset_type_id
            WHERE {" AND ".join(top_branches_clauses)}
            GROUP BY a.branch
            ORDER BY value DESC, a.branch
            LIMIT 5
            """
        ),
        top_branch_params,
    ).mappings().all()

    total_network_km = sum(float(row["length_km"] or 0) for row in network_rows)
    total_network_features = sum(int(row["feature_count"]) for row in network_rows)

    return {
        "transformers": {
            "total": 57360,
            "scope_count": int(transformer_scope),
            "service_areas": int(footprint["service_areas"] or 0),
            "branches": int(footprint["branches"] or 0),
            "feeders": int(footprint["feeders"] or 0),
        },
        "stations": {
            "total": int(stations),
        },
        "network": {
            "feature_count": total_network_features,
            "length_km": round(total_network_km, 1),
            "classes": [
                {
                    "network_class": row["network_class"],
                    "voltage_kv": float(row["voltage_kv"]) if row["voltage_kv"] is not None else None,
                    "feature_count": int(row["feature_count"]),
                    "length_km": float(row["length_km"] or 0),
                }
                for row in network_rows
            ],
        },
        "top_service_areas": [dict(row) for row in top_service_areas],
        "top_branches": [dict(row) for row in top_branches],
        "filters": {
            "service_area": service_area,
            "branch": branch,
            "feeder": feeder,
        },
    }

from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db


router = APIRouter(tags=["operations"])
settings = get_settings()

AssetStatus = Literal[
    "unknown",
    "active",
    "attention",
    "maintenance_planned",
    "out_of_service",
]
AssetCondition = Literal["unknown", "good", "fair", "poor", "critical"]
MaintenancePriority = Literal["unassigned", "low", "medium", "high", "critical"]
MaintenanceStatus = Literal["planned", "in_progress", "completed", "cancelled"]

def _require_demo_writes() -> None:
    if not settings.demo_writes_enabled:
        raise HTTPException(status_code=403, detail="Public deployment is read-only.")



class OperationalStateUpdate(BaseModel):
    status: AssetStatus
    condition: AssetCondition
    maintenance_priority: MaintenancePriority


class InspectionCreate(BaseModel):
    condition: AssetCondition
    inspector_name: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1200)
    maintenance_priority: MaintenancePriority | None = None


class MaintenanceCreate(BaseModel):
    maintenance_type: str = Field(min_length=2, max_length=120)
    scheduled_for: date | None = None
    status: MaintenanceStatus = "planned"
    notes: str | None = Field(default=None, max_length=1200)


def _require_asset(db: Session, asset_id: UUID) -> dict:
    row = db.execute(
        text(
            """
            SELECT
                a.id::text AS id,
                at.code AS asset_type,
                at.name AS asset_type_name,
                a.status,
                a.condition,
                a.maintenance_priority
            FROM assets a
            JOIN asset_types at ON at.id = a.asset_type_id
            WHERE a.id = :asset_id
            """
        ),
        {"asset_id": str(asset_id)},
    ).mappings().first()

    if row is None:
        raise HTTPException(status_code=404, detail="Asset not found.")

    return dict(row)


@router.get("/assets/{asset_id}/operations")
def get_asset_operations(
    asset_id: UUID,
    db: Session = Depends(get_db),
) -> dict:
    asset = _require_asset(db, asset_id)

    inspections = db.execute(
        text(
            """
            SELECT
                id::text AS id,
                inspected_at,
                inspector_name,
                condition,
                notes,
                created_at
            FROM inspections
            WHERE asset_id = :asset_id
            ORDER BY inspected_at DESC, created_at DESC
            LIMIT 20
            """
        ),
        {"asset_id": str(asset_id)},
    ).mappings().all()

    maintenance = db.execute(
        text(
            """
            SELECT
                id::text AS id,
                maintenance_type,
                scheduled_for,
                completed_at,
                status,
                notes,
                created_at
            FROM maintenance_records
            WHERE asset_id = :asset_id
            ORDER BY
                CASE WHEN completed_at IS NULL THEN 0 ELSE 1 END,
                scheduled_for NULLS LAST,
                created_at DESC
            LIMIT 20
            """
        ),
        {"asset_id": str(asset_id)},
    ).mappings().all()

    return {
        "asset": asset,
        "inspections": [dict(row) for row in inspections],
        "maintenance": [dict(row) for row in maintenance],
        "demo_notice": (
            "Operational status, inspection and maintenance records in this "
            "portfolio project are demonstration data and are not official utility records."
        ),
    }


@router.patch("/assets/{asset_id}/operations")
def update_asset_operations(
    asset_id: UUID,
    payload: OperationalStateUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(_require_demo_writes),
) -> dict:
    _require_asset(db, asset_id)

    db.execute(
        text(
            """
            UPDATE assets
            SET
                status = :status,
                condition = :condition,
                maintenance_priority = :maintenance_priority,
                updated_at = NOW()
            WHERE id = :asset_id
            """
        ),
        {
            "asset_id": str(asset_id),
            "status": payload.status,
            "condition": payload.condition,
            "maintenance_priority": payload.maintenance_priority,
        },
    )
    db.commit()

    return {
        "status": payload.status,
        "condition": payload.condition,
        "maintenance_priority": payload.maintenance_priority,
    }


@router.post("/assets/{asset_id}/inspections", status_code=201)
def create_inspection(
    asset_id: UUID,
    payload: InspectionCreate,
    db: Session = Depends(get_db),
    _: None = Depends(_require_demo_writes),
) -> dict:
    _require_asset(db, asset_id)

    row = db.execute(
        text(
            """
            INSERT INTO inspections (
                asset_id,
                inspector_name,
                condition,
                notes
            )
            VALUES (
                :asset_id,
                :inspector_name,
                :condition,
                :notes
            )
            RETURNING
                id::text AS id,
                inspected_at,
                inspector_name,
                condition,
                notes,
                created_at
            """
        ),
        {
            "asset_id": str(asset_id),
            "inspector_name": payload.inspector_name,
            "condition": payload.condition,
            "notes": payload.notes,
        },
    ).mappings().one()

    update_values: dict[str, object] = {
        "asset_id": str(asset_id),
        "condition": payload.condition,
    }
    priority_sql = ""
    if payload.maintenance_priority is not None:
        priority_sql = ", maintenance_priority = :maintenance_priority"
        update_values["maintenance_priority"] = payload.maintenance_priority

    db.execute(
        text(
            """
            UPDATE assets
            SET condition = :condition
            """
            + priority_sql
            + """, updated_at = NOW()
            WHERE id = :asset_id
            """
        ),
        update_values,
    )

    db.commit()
    return dict(row)


@router.post("/assets/{asset_id}/maintenance", status_code=201)
def create_maintenance(
    asset_id: UUID,
    payload: MaintenanceCreate,
    db: Session = Depends(get_db),
    _: None = Depends(_require_demo_writes),
) -> dict:
    _require_asset(db, asset_id)

    completed_expression = "NOW()" if payload.status == "completed" else "NULL"

    row = db.execute(
        text(
            f"""
            INSERT INTO maintenance_records (
                asset_id,
                maintenance_type,
                scheduled_for,
                completed_at,
                status,
                notes
            )
            VALUES (
                :asset_id,
                :maintenance_type,
                :scheduled_for,
                {completed_expression},
                :status,
                :notes
            )
            RETURNING
                id::text AS id,
                maintenance_type,
                scheduled_for,
                completed_at,
                status,
                notes,
                created_at
            """
        ),
        {
            "asset_id": str(asset_id),
            "maintenance_type": payload.maintenance_type.strip(),
            "scheduled_for": payload.scheduled_for,
            "status": payload.status,
            "notes": payload.notes,
        },
    ).mappings().one()

    db.commit()
    return dict(row)

"""Load Kenya transmission station points into GeoAsset PostGIS.

Download the public GeoJSON manually from ENERGYDATA.INFO if the portal blocks
automated requests, then save it locally (default path below).

Usage:
    python scripts/ingest_transmission_stations.py --dry-run
    python scripts/ingest_transmission_stations.py --replace
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import geopandas as gpd
from sqlalchemy import create_engine, text


DEFAULT_INPUT = Path("data/raw/transmission_stations.geojson")
ASSET_TYPE = "transmission_station"
SOURCE_NAME = "Kenya - Transmission Stations (ENERGYDATA.INFO)"
SOURCE_LICENSE = "CC0 1.0"

ID_CANDIDATES = ("OBJECTID", "ObjectID", "objectid", "FID", "fid", "ID", "id")
NAME_CANDIDATES = ("name", "Name", "NAME", "station", "Station", "STATION")
VOLTAGE_CANDIDATES = ("voltage_kv", "Voltage", "VOLTAGE", "voltage", "KV", "kV")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--replace", action="store_true")
    return parser.parse_args()


def first_value(properties: dict[str, Any], candidates: tuple[str, ...]) -> Any:
    for key in candidates:
        value = properties.get(key)
        if value is not None and str(value).strip():
            return value
    return None


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(str(value).lower().replace("kv", "").strip())
    except (TypeError, ValueError):
        return None


def json_safe(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return str(value)


def main() -> None:
    args = parse_args()
    if not args.input.exists():
        raise FileNotFoundError(
            f"Missing {args.input}. Download the GeoJSON from the public "
            "Kenya - Transmission Stations dataset on ENERGYDATA.INFO and "
            "save it at that path."
        )

    gdf = gpd.read_file(args.input)
    print(f"Rows: {len(gdf):,}")
    print(f"CRS: {gdf.crs}")
    print(f"Geometry types: {gdf.geometry.geom_type.value_counts().to_dict()}")
    print(f"Columns: {list(gdf.columns)}")

    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    else:
        gdf = gdf.to_crs(4326)

    gdf = gdf[gdf.geometry.notna() & (gdf.geometry.geom_type == "Point")].copy()
    print(f"Usable point features: {len(gdf):,}")

    if args.dry_run:
        for column in gdf.columns:
            if column != "geometry":
                values = gdf[column].dropna().astype(str).drop_duplicates().head(5).tolist()
                print(f"{column}: {values}")
        return

    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://geoasset:geoasset_dev@localhost:5432/geoasset",
    )
    engine = create_engine(database_url)

    with engine.begin() as connection:
        asset_type_id = connection.execute(
            text("SELECT id FROM asset_types WHERE code=:code"),
            {"code": ASSET_TYPE},
        ).scalar_one()

        if args.replace:
            deleted = connection.execute(
                text("DELETE FROM assets WHERE asset_type_id=:asset_type_id"),
                {"asset_type_id": asset_type_id},
            ).rowcount
            print(f"Removed {deleted:,} existing transmission station records.")

        insert_sql = text(
            """
            INSERT INTO assets (
                source_id, asset_type_id, name, voltage_kv,
                status, condition, maintenance_priority,
                source_name, source_license, source_properties, geom
            )
            VALUES (
                :source_id, :asset_type_id, :name, :voltage_kv,
                'unknown', 'unknown', 'unassigned',
                :source_name, :source_license, CAST(:source_properties AS jsonb),
                ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
            )
            """
        )

        payload = []
        for row_number, (_, row) in enumerate(gdf.iterrows(), start=1):
            properties = {
                key: json_safe(value)
                for key, value in row.items()
                if key != "geometry"
            }
            point = row.geometry
            source_id = first_value(properties, ID_CANDIDATES) or f"transmission-{row_number}"
            payload.append(
                {
                    "source_id": str(source_id),
                    "asset_type_id": asset_type_id,
                    "name": first_value(properties, NAME_CANDIDATES),
                    "voltage_kv": as_float(first_value(properties, VOLTAGE_CANDIDATES)),
                    "source_name": SOURCE_NAME,
                    "source_license": SOURCE_LICENSE,
                    "source_properties": json.dumps(properties, default=str),
                    "longitude": float(point.x),
                    "latitude": float(point.y),
                }
            )

        connection.execute(insert_sql, payload)

    print(f"Loaded {len(payload):,} transmission stations.")


if __name__ == "__main__":
    main()

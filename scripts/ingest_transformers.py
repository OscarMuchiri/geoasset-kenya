"""Download, profile and load Kenya distribution transformers into PostGIS.

The public source is ENERGYDATA.INFO / World Bank Group, attributed on the
portal to Kenya Power and Lighting Company (KPLC).

Examples
--------
Profile the source without touching the database:

    python scripts/ingest_transformers.py --download --dry-run

Load the source into a running local PostGIS database:

    python scripts/ingest_transformers.py --download --replace

Use an already downloaded file:

    python scripts/ingest_transformers.py --input data/raw/distribution_transformers.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

import geopandas as gpd
import requests
from sqlalchemy import create_engine, text


SOURCE_URL = (
    "https://energydata.info/dataset/"
    "84ca7288-1d10-469d-a98d-26643f869367/resource/"
    "8d319200-e0c2-402d-96c0-d5ee4dfa8d3c/download/"
    "distribution_transformers.json"
)
DEFAULT_INPUT = Path("data/raw/distribution_transformers.json")
SOURCE_NAME = "Kenya - Distribution Transformers (ENERGYDATA.INFO)"
SOURCE_LICENSE = "CC BY 4.0"
ASSET_TYPE = "distribution_transformer"

ID_CANDIDATES = (
    "source_id",
    "OBJECTID",
    "ObjectID",
    "objectid",
    "FID",
    "fid",
    "ID",
    "id",
)
NAME_CANDIDATES = (
    "name",
    "Name",
    "NAME",
    "station",
    "Station",
    "transformer",
    "Transformer",
)
VOLTAGE_CANDIDATES = (
    "voltage_kv",
    "Voltage",
    "VOLTAGE",
    "voltage",
    "KV",
    "kV",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument(
        "--download",
        action="store_true",
        help="Download/refresh the GeoJSON from ENERGYDATA.INFO before reading it.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Profile and normalize the dataset without writing to PostGIS.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete previously ingested distribution transformers first.",
    )
    return parser.parse_args()


def download_source(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {SOURCE_URL}")
    with requests.get(SOURCE_URL, stream=True, timeout=180) as response:
        response.raise_for_status()
        with destination.open("wb") as file_handle:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file_handle.write(chunk)
    print(f"Saved source dataset to {destination}")


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
        cleaned = str(value).lower().replace("kv", "").strip()
        return float(cleaned)
    except (TypeError, ValueError):
        return None


def make_source_id(properties: dict[str, Any], lon: float, lat: float, row_no: int) -> str:
    candidate = first_value(properties, ID_CANDIDATES)
    if candidate is not None:
        return str(candidate)

    payload = json.dumps(properties, sort_keys=True, default=str)
    digest = hashlib.sha1(
        f"{lon:.8f}|{lat:.8f}|{row_no}|{payload}".encode("utf-8")
    ).hexdigest()[:16]
    return f"transformer-{digest}"


def profile(gdf: gpd.GeoDataFrame) -> None:
    print("\n=== Source profile ===")
    print(f"Rows: {len(gdf):,}")
    print(f"CRS: {gdf.crs}")
    print(f"Geometry types: {gdf.geometry.geom_type.value_counts().to_dict()}")
    print(f"Missing geometry: {int(gdf.geometry.isna().sum()):,}")
    print(f"Columns ({len(gdf.columns)}): {list(gdf.columns)}")

    if not gdf.empty:
        minx, miny, maxx, maxy = gdf.total_bounds
        print(
            "Bounds: "
            f"lon {minx:.5f} to {maxx:.5f}, "
            f"lat {miny:.5f} to {maxy:.5f}"
        )


def normalize(gdf: gpd.GeoDataFrame) -> list[dict[str, Any]]:
    if gdf.crs is None:
        # ENERGYDATA.INFO identifies this resource as GeoJSON; GeoJSON normally
        # uses WGS84 longitude/latitude. We still make the assumption explicit.
        gdf = gdf.set_crs(4326)
    else:
        gdf = gdf.to_crs(4326)

    gdf = gdf[gdf.geometry.notna()].copy()
    gdf = gdf[gdf.geometry.geom_type == "Point"].copy()

    records: list[dict[str, Any]] = []

    for row_no, (_, row) in enumerate(gdf.iterrows(), start=1):
        point = row.geometry
        properties = {
            key: (None if _is_missing(value) else _json_safe(value))
            for key, value in row.items()
            if key != "geometry"
        }

        records.append(
            {
                "source_id": make_source_id(
                    properties, float(point.x), float(point.y), row_no
                ),
                "name": _string_or_none(first_value(properties, NAME_CANDIDATES)),
                "voltage_kv": as_float(first_value(properties, VOLTAGE_CANDIDATES)),
                "source_properties": properties,
                "longitude": float(point.x),
                "latitude": float(point.y),
            }
        )

    print(f"Usable point features after normalization: {len(records):,}")
    return records


def _is_missing(value: Any) -> bool:
    try:
        result = value != value
        return bool(result)
    except Exception:
        return False


def _json_safe(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    return str(value)


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text_value = str(value).strip()
    return text_value or None


def load_records(records: list[dict[str, Any]], replace: bool) -> None:
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://geoasset:geoasset_dev@localhost:5432/geoasset",
    )
    engine = create_engine(database_url)

    with engine.begin() as connection:
        type_id = connection.execute(
            text("SELECT id FROM asset_types WHERE code = :code"),
            {"code": ASSET_TYPE},
        ).scalar_one()

        if replace:
            deleted = connection.execute(
                text("DELETE FROM assets WHERE asset_type_id = :asset_type_id"),
                {"asset_type_id": type_id},
            ).rowcount
            print(f"Removed {deleted:,} existing transformer records.")

        insert_sql = text(
            """
            INSERT INTO assets (
                source_id,
                asset_type_id,
                name,
                voltage_kv,
                status,
                condition,
                maintenance_priority,
                source_name,
                source_license,
                source_properties,
                geom
            )
            VALUES (
                :source_id,
                :asset_type_id,
                :name,
                :voltage_kv,
                'unknown',
                'unknown',
                'unassigned',
                :source_name,
                :source_license,
                CAST(:source_properties AS jsonb),
                ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)
            )
            """
        )

        payload = [
            {
                **record,
                "asset_type_id": type_id,
                "source_name": SOURCE_NAME,
                "source_license": SOURCE_LICENSE,
                "source_properties": json.dumps(
                    record["source_properties"], default=str
                ),
            }
            for record in records
        ]

        chunk_size = 2000
        for start in range(0, len(payload), chunk_size):
            connection.execute(insert_sql, payload[start : start + chunk_size])
            print(
                f"Loaded {min(start + chunk_size, len(payload)):,}"
                f"/{len(payload):,} features"
            )

    print("Transformer ingestion complete.")


def main() -> None:
    args = parse_args()

    if args.download or not args.input.exists():
        download_source(args.input)

    print(f"Reading {args.input}")
    gdf = gpd.read_file(args.input)
    profile(gdf)
    records = normalize(gdf)

    if args.dry_run:
        print("\nDry run complete; no database changes were made.")
        return

    load_records(records, replace=args.replace)


if __name__ == "__main__":
    main()

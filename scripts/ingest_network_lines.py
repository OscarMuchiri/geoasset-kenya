"""Load one or more Kenya electricity network GeoJSON files into PostGIS.

Examples:
    python scripts/ingest_network_lines.py --input data/raw/network_132kv.geojson --voltage 132 --dry-run
    python scripts/ingest_network_lines.py --input data/raw/network_132kv.geojson --voltage 132 --replace-class
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import geopandas as gpd
from sqlalchemy import create_engine, text


SOURCE_NAME = "Kenya - Kenya Electricity Network (ENERGYDATA.INFO)"
SOURCE_LICENSE = "CC0 1.0"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--voltage", type=float)
    parser.add_argument("--network-class")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--replace-class", action="store_true")
    return parser.parse_args()


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
        raise FileNotFoundError(f"Missing input file: {args.input}")

    network_class = args.network_class or (
        f"{int(args.voltage)}kV" if args.voltage is not None else "unidentified"
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

    valid_geometry = gdf.geometry.notna() & ~gdf.geometry.is_empty
    gdf = gdf[
        valid_geometry
        & gdf.geometry.geom_type.isin(["LineString", "MultiLineString"])
    ].copy()
    print(f"Usable line features: {len(gdf):,}")
    print(f"Network class: {network_class}")

    if args.dry_run:
        if not gdf.empty:
            minx, miny, maxx, maxy = gdf.total_bounds
            print(f"WGS84 bounds: {minx:.5f}, {miny:.5f}, {maxx:.5f}, {maxy:.5f}")
        return

    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://geoasset:geoasset_dev@localhost:5432/geoasset",
    )
    engine = create_engine(database_url)

    with engine.begin() as connection:
        if args.replace_class:
            deleted = connection.execute(
                text("DELETE FROM network_lines WHERE network_class=:network_class"),
                {"network_class": network_class},
            ).rowcount
            print(f"Removed {deleted:,} existing {network_class} records.")

        insert_sql = text(
            """
            INSERT INTO network_lines (
                source_id, name, voltage_kv, network_class,
                source_name, source_license, source_properties, geom
            )
            VALUES (
                :source_id, :name, :voltage_kv, :network_class,
                :source_name, :source_license, CAST(:source_properties AS jsonb),
                ST_SetSRID(ST_GeomFromGeoJSON(:geometry), 4326)
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
            source_id = (
                properties.get("OBJECTID")
                or properties.get("FID")
                or properties.get("id")
                or f"{network_class}-{row_number}"
            )
            name = properties.get("Name") or properties.get("name")
            payload.append(
                {
                    "source_id": str(source_id),
                    "name": name,
                    "voltage_kv": args.voltage,
                    "network_class": network_class,
                    "source_name": SOURCE_NAME,
                    "source_license": SOURCE_LICENSE,
                    "source_properties": json.dumps(properties, default=str),
                    "geometry": json.dumps(row.geometry.__geo_interface__),
                }
            )

        chunk_size = 2000
        for start in range(0, len(payload), chunk_size):
            connection.execute(insert_sql, payload[start:start + chunk_size])
            print(f"Loaded {min(start + chunk_size, len(payload)):,}/{len(payload):,}")

    print(f"Loaded {len(payload):,} {network_class} network features.")


if __name__ == "__main__":
    main()

# GeoAsset Kenya Architecture

## Overview

GeoAsset Kenya is designed as a three-layer geospatial web application:

1. **Next.js frontend** — user interface, map rendering and analytics.
2. **FastAPI service** — REST endpoints, filtering, validation and spatial-query orchestration.
3. **PostgreSQL/PostGIS** — authoritative application store for geometry and asset-management records.

## Spatial model

Point infrastructure is stored in `assets` using WGS84 / EPSG:4326 geometries. Electricity-network geometries are stored separately in `network_lines` because they are linear features and may contain multi-part geometries.

The source feature properties are retained in JSONB so the ingestion pipeline can preserve original metadata while exposing a normalized application schema.

## Asset-management model

Public source datasets describe infrastructure location and available source attributes. Operational fields are modeled separately for the application:

- condition;
- operational status;
- maintenance priority;
- inspections; and
- maintenance records.

Unless an authoritative public source is available, those operational values are demo/synthetic data and must be labelled accordingly in the UI and documentation.

## API milestones

Initial endpoints:

- `GET /health`
- `GET /assets`
- `GET /assets/{id}`
- `GET /assets/nearby`
- `GET /network-lines`
- `GET /stats/summary`

Later authenticated workflows will add create/update operations for inspections and maintenance records.

## Frontend milestones

The first frontend release will provide:

- Kenya-focused interactive map;
- layer toggles;
- clustered transformer display;
- substation and transmission-station symbols;
- electricity-network styling by voltage/class;
- asset detail drawer;
- search and filters; and
- summary KPI cards.

## Deployment

The intended production layout is:

- frontend on Vercel;
- FastAPI on a managed container/application host; and
- managed PostgreSQL with PostGIS support.

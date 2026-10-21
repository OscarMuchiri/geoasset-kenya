# GeoAsset Kenya

**Full-stack geospatial asset management platform for mapping and monitoring Kenya’s electricity infrastructure.**

GeoAsset Kenya is a portfolio-grade geospatial application that combines **web mapping, spatial databases, APIs and asset-management workflows**. The project uses public electricity-infrastructure datasets for Kenya and layers clearly identified demo operational fields on top of them for inspection, maintenance and condition-monitoring workflows.

## Project goals

The first release will allow a user to:

- explore electricity transformers, substations and network lines on an interactive map;
- search and filter infrastructure assets;
- open an asset and inspect its spatial and descriptive attributes;
- view operational status, condition and maintenance priority;
- record inspections and maintenance activity;
- run spatial queries such as nearby-asset searches; and
- view summary analytics for infrastructure assets.

## Planned stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Web map | MapLibre GL JS |
| API | FastAPI |
| Database | PostgreSQL + PostGIS |
| ORM / spatial access | SQLAlchemy + GeoAlchemy2 |
| Data processing | Python, GeoPandas, Shapely |
| Deployment | Vercel + managed API/database hosting |
| Containers | Docker Compose |

## Data

The project is built around public Kenyan electricity datasets published through **ENERGYDATA.INFO / World Bank Group**, including:

- Kenya Distribution Transformers
- Kenya Primary Substations
- Kenya Electricity Network
- Kenya Transmission Stations

Source-specific licensing and provenance are documented in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

> Operational fields such as asset condition, inspection status and maintenance priority will be synthetic/demo data unless a public authoritative source is available. They will never be presented as current KPLC operational records.

## Architecture

```text
Browser
   │
   ▼
Next.js + MapLibre
   │ REST / GeoJSON
   ▼
FastAPI
   │
   ▼
PostgreSQL + PostGIS
   │
   ├── infrastructure assets
   ├── network lines
   ├── inspections
   └── maintenance records
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the planned system design.

## Repository structure

```text
geoasset-kenya/
├── backend/          # FastAPI service
├── frontend/         # Next.js web application
├── database/         # PostGIS schema and setup
├── data/             # Local data workspace (raw datasets are ignored)
├── docs/             # Architecture and data provenance
├── .env.example
├── docker-compose.yml
└── README.md
```

## Current status

**Phase 1 — Foundation and data preparation**

- [x] Project repository created
- [x] Architecture selected
- [x] Core public data sources verified
- [x] Initial PostGIS schema designed
- [ ] Download and profile source datasets
- [x] Build repeatable ingestion pipeline
- [x] Load transformer layer into PostGIS
- [x] Load transmission station layer into PostGIS
- [x] Load 66/132/220 kV electricity network layers into PostGIS
- [x] Build FastAPI asset endpoints
- [x] Build interactive MapLibre interface
- [ ] Add inspection and maintenance workflows
- [ ] Add analytics and spatial-query tools
- [ ] Deploy production application

## Local development

Start the PostGIS database:

```bash
cp .env.example .env
docker compose up -d db
```

Run the API after installing the backend requirements:

```bash
cd backend
python -m venv .venv
# activate the environment for your OS
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API health check will be available at:

```text
http://localhost:8000/health
```

## Author

**Oscar Muchiri**  
Computer Scientist | Machine Learning • Software Engineering • Geospatial Systems

[Portfolio](https://oscar-muchiri-portfolio.vercel.app) · [GitHub](https://github.com/OscarMuchiri)

## License

Application source code is licensed under the MIT License. Third-party datasets retain their original licenses and attribution requirements.

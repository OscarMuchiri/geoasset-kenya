# Data ingestion scripts

## Distribution transformers

The first ingestion pipeline works with the public **Kenya - Distribution Transformers** GeoJSON from ENERGYDATA.INFO.

From the repository root:

```bash
python -m venv .venv
# Activate the virtual environment, then:
pip install -r backend/requirements.txt
```

Profile the source dataset without loading PostGIS:

```bash
python scripts/ingest_transformers.py --download --dry-run
```

Start PostGIS:

```bash
cp .env.example .env
docker compose up -d db
```

Then load transformers:

```bash
python scripts/ingest_transformers.py --replace
```

The loader:

1. preserves the original feature attributes in `source_properties`;
2. normalizes point geometry to EPSG:4326;
3. maps recognizable source identifiers, names and voltage fields when present;
4. leaves operational status/condition fields neutral until demo values are explicitly generated; and
5. writes geometries into the indexed PostGIS `assets` table.

After loading, test:

```bash
cd backend
uvicorn app.main:app --reload
```

Then open:

```text
http://localhost:8000/assets?asset_type=distribution_transformer&limit=20
```

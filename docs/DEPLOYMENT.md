# Deployment

GeoAsset Kenya uses a split production deployment:

- **Frontend:** Vercel
- **API:** Render
- **Database:** Supabase PostgreSQL + PostGIS

## Production URLs

- Frontend: https://geoasset-kenya.vercel.app
- API: https://geoasset-kenya-api.onrender.com
- Health check: https://geoasset-kenya-api.onrender.com/health

## 1. Database on Supabase

The production database is hosted on Supabase with PostGIS enabled.

Production data includes:

- 57,360 distribution transformers
- 83 transmission stations
- 346 network-line features
- demo inspection and maintenance records

The application backend connects through the Supabase Session Pooler on port 5432.

All application tables in the public schema have Row Level Security enabled. No public Data API policies are defined because the browser does not access Supabase directly; all application reads go through FastAPI.

## 2. API on Render

The API is deployed as the Render web service `geoasset-kenya-api`.

Required environment variables:

```text
DATABASE_URL=<Supabase Session Pooler URI>
DEMO_WRITES_ENABLED=false
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
CORS_ORIGIN_REGEX=https://.*\.vercel\.app
```

Build command:

```text
pip install -r backend/requirements.txt
```

Start command:

```text
cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Verify:

```text
https://geoasset-kenya-api.onrender.com/health
```

Expected response:

```json
{"status":"ok","database":"reachable"}
```

## 3. Frontend on Vercel

The GitHub repository is imported into Vercel with:

- Framework preset: **Next.js**
- Root Directory: **frontend**

Environment variables:

```text
NEXT_PUBLIC_API_URL=https://geoasset-kenya-api.onrender.com
NEXT_PUBLIC_DEMO_WRITES_ENABLED=false
```

The public production deployment is intentionally read-only for demo operational records.

## 4. Production checks

Verify:

1. the map loads;
2. transformer clusters and points load;
3. transmission stations load;
4. 66/132/220 kV network layers load;
5. service-area, branch, feeder and demo-state filters work;
6. search works;
7. analytics loads and ranking selections can focus the map;
8. asset details and demo history load;
9. public write controls are hidden;
10. `/health` reports the database as reachable.

## Data migration reference

A local data-only PostgreSQL dump can be created with:

```bat
docker compose exec -T db pg_dump -U geoasset -d geoasset --format=custom --data-only --no-owner --no-acl --table=asset_types --table=assets --table=network_lines --table=inspections --table=maintenance_records > geoasset-data.dump
```

The dump should not be committed to Git.

## Security and provenance

Public infrastructure layers retain their documented source licensing.

Operational status, condition, inspection and maintenance records are clearly marked as demonstration data and are not presented as official utility operational records.

Database passwords and connection strings must remain in environment variables and must never be committed to the repository.

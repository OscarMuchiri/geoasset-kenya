# Deployment

GeoAsset Kenya uses a split deployment:

- **Frontend:** Vercel
- **API:** Render
- **Database:** Render PostgreSQL with PostGIS

The repository includes `render.yaml`, which defines the API and managed PostgreSQL service.

## 1. Deploy the API and database on Render

Create a new Render Blueprint from this repository and select the repository root.

Render will read `render.yaml` and create:

- `geoasset-kenya-api`
- `geoasset-kenya-db`

The API start command initializes the database schema idempotently before starting Uvicorn.

After deployment, verify:

```text
https://<your-api>.onrender.com/health
```

Expected response:

```json
{"status":"ok","database":"reachable"}
```

## 2. Copy the local PostGIS data to Render

This preserves the currently loaded infrastructure data as well as demo inspection and maintenance records.

From the repository root on Windows Command Prompt:

```bat
docker compose exec -T db pg_dump -U geoasset -d geoasset --format=custom --data-only --no-owner --no-acl --table=asset_types --table=assets --table=network_lines --table=inspections --table=maintenance_records > geoasset-data.dump
```

Copy the **External Database URL** from the Render database dashboard.

Set it temporarily in Command Prompt:

```bat
set RENDER_DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

Clear the empty production tables created during initialization:

```bat
docker run --rm postgres:16-alpine psql "%RENDER_DATABASE_URL%" -c "TRUNCATE maintenance_records, inspections, assets, network_lines, asset_types RESTART IDENTITY CASCADE;"
```

Restore the local data snapshot:

```bat
docker run --rm -i postgres:16-alpine pg_restore --no-owner --no-acl --data-only --dbname="%RENDER_DATABASE_URL%" < geoasset-data.dump
```

Verify counts:

```bat
docker run --rm postgres:16-alpine psql "%RENDER_DATABASE_URL%" -c "SELECT COUNT(*) AS assets FROM assets; SELECT COUNT(*) AS network_lines FROM network_lines;"
```

Do not commit `geoasset-data.dump`.

## 3. Deploy the frontend on Vercel

Import the GitHub repository into Vercel.

Use:

- Framework preset: **Next.js**
- Root Directory: **frontend**

Create this environment variable for Production and Preview:

```text
NEXT_PUBLIC_API_URL=https://<your-api>.onrender.com
```

Then deploy.

## 4. Final production checks

Verify:

1. the map loads;
2. transformer, station and transmission-line layers load;
3. search and filters work;
4. analytics opens and rankings filter the map;
5. asset details load;
6. demo inspection, maintenance and state updates save successfully;
7. `/health` reports the database as reachable.

## Security and provenance

Public infrastructure layers retain their documented source licensing.

Operational status, condition, inspection and maintenance records are clearly marked as demonstration data and are not presented as official utility operational records.

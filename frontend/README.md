# GeoAsset Kenya Frontend

Interactive geospatial interface built with **Next.js, TypeScript and MapLibre GL JS**.

## Current capabilities

- Kenya-focused map using OpenStreetMap tiles
- transformer clusters and individual asset points
- viewport-aware PostGIS queries through FastAPI
- service-area and branch filters
- interactive asset detail drawer
- source/licensing context
- responsive dark technical interface

## Run locally

Make sure the FastAPI backend is running on port 8000, then:

```bash
cd frontend
copy .env.example .env.local
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

The frontend defaults to `http://127.0.0.1:8000` for the API. Override `NEXT_PUBLIC_API_URL` for deployed environments.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS asset_types (
    id SERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT,
    asset_type_id INTEGER REFERENCES asset_types(id),
    name TEXT,
    voltage_kv NUMERIC,
    region TEXT,
    county TEXT,
    branch TEXT,
    feeder TEXT,
    origin_area TEXT,
    asset_structure TEXT,
    dcs_category TEXT,
    installation_environment TEXT,
    isolation_type TEXT,
    road_name TEXT,
    street_name TEXT,
    location_description TEXT,
    status TEXT NOT NULL DEFAULT 'unknown',
    condition TEXT NOT NULL DEFAULT 'unknown',
    maintenance_priority TEXT NOT NULL DEFAULT 'unassigned',
    source_name TEXT,
    source_license TEXT,
    source_properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geometry(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assets_geom_gix ON assets USING GIST (geom);
CREATE INDEX IF NOT EXISTS assets_type_idx ON assets (asset_type_id);
CREATE INDEX IF NOT EXISTS assets_county_idx ON assets (county);
CREATE INDEX IF NOT EXISTS assets_branch_idx ON assets (branch);
CREATE INDEX IF NOT EXISTS assets_feeder_idx ON assets (feeder);

CREATE TABLE IF NOT EXISTS network_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT,
    name TEXT,
    voltage_kv NUMERIC,
    network_class TEXT,
    source_name TEXT,
    source_license TEXT,
    source_properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom geometry(Geometry, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS network_lines_geom_gix ON network_lines USING GIST (geom);

CREATE TABLE IF NOT EXISTS inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    inspected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    inspector_name TEXT,
    condition TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    maintenance_type TEXT NOT NULL,
    scheduled_for DATE,
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'planned',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO asset_types (code, name)
VALUES
    ('distribution_transformer', 'Distribution Transformer'),
    ('primary_substation', 'Primary Substation'),
    ('transmission_station', 'Transmission Station')
ON CONFLICT (code) DO NOTHING;

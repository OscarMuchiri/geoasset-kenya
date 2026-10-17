"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import {
  Activity,
  Database,
  Filter,
  Layers3,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  X
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type FeatureProperties = {
  source_id?: string | null;
  asset_type_name?: string | null;
  service_area?: string | null;
  branch?: string | null;
  feeder?: string | null;
  asset_reference?: string | null;
  asset_structure?: string | null;
  installation_environment?: string | null;
  isolation_type?: string | null;
  road_name?: string | null;
  street_name?: string | null;
  location_description?: string | null;
  source_name?: string | null;
  source_license?: string | null;
};

type AssetFeature = GeoJSON.Feature<GeoJSON.Point, FeatureProperties>;

type FilterOptions = {
  service_areas: string[];
  branches: string[];
  feeders: string[];
};

const emptyCollection: GeoJSON.FeatureCollection<GeoJSON.Point, FeatureProperties> = {
  type: "FeatureCollection",
  features: []
};

export default function HomePage() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadAssetsRef = useRef<() => Promise<void>>(async () => {});
  const searchQueryRef = useRef("");

  const [selected, setSelected] = useState<AssetFeature | null>(null);
  const [serviceArea, setServiceArea] = useState("");
  const [branch, setBranch] = useState("");
  const [feeder, setFeeder] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    service_areas: [],
    branches: [],
    feeders: []
  });
  const [visibleCount, setVisibleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Loading infrastructure…");

  const syncSelectedSource = useCallback((feature: AssetFeature | null) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("selected-asset") as GeoJSONSource | undefined;
    source?.setData(
      feature
        ? {
            type: "FeatureCollection",
            features: [feature]
          }
        : emptyCollection
    );
  }, []);

  const loadAssets = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const params = new URLSearchParams({
      asset_type: "distribution_transformer",
      limit: "5000"
    });

    if (serviceArea) params.set("service_area", serviceArea);
    if (branch) params.set("branch", branch);
    if (feeder) params.set("feeder", feeder);

    if (searchQuery) {
      params.set("q", searchQuery);
    } else {
      const bounds = map.getBounds();
      params.set("min_lon", String(bounds.getWest()));
      params.set("min_lat", String(bounds.getSouth()));
      params.set("max_lon", String(bounds.getEast()));
      params.set("max_lat", String(bounds.getNorth()));
    }

    setLoading(true);
    setMessage(searchQuery ? "Searching transformer assets…" : "Loading visible assets…");

    try {
      const response = await fetch(`${API_URL}/assets?${params.toString()}`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);

      const data = await response.json();
      const source = map.getSource("transformers") as GeoJSONSource | undefined;
      source?.setData(data);

      const count = data?.meta?.count ?? data?.features?.length ?? 0;
      setVisibleCount(count);

      if (searchQuery) {
        setMessage(
          count === 0
            ? "No matching assets found"
            : `${count.toLocaleString()} search result${count === 1 ? "" : "s"}`
        );

        const first = data?.features?.[0] as AssetFeature | undefined;
        if (first && Array.isArray(first.geometry?.coordinates)) {
          const [longitude, latitude] = first.geometry.coordinates;
          map.easeTo({
            center: [longitude, latitude],
            zoom: Math.max(map.getZoom(), 12.5),
            duration: 900
          });
          setSelected(first);
          syncSelectedSource(first);
        }
      } else {
        setMessage(
          count >= 5000
            ? "Showing first 5,000 assets in this view"
            : "Map synchronized with PostGIS"
        );
      }
    } catch (error) {
      console.error(error);
      setMessage("Could not reach the GeoAsset API");
    } finally {
      setLoading(false);
    }
  }, [branch, feeder, searchQuery, serviceArea, syncSelectedSource]);

  useEffect(() => {
    loadAssetsRef.current = loadAssets;
    searchQueryRef.current = searchQuery;
  }, [loadAssets, searchQuery]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (serviceArea) params.set("service_area", serviceArea);
    if (branch) params.set("branch", branch);

    fetch(`${API_URL}/assets/filter-options?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error("Could not load filter options");
        return response.json();
      })
      .then((data) => setFilterOptions(data))
      .catch(() => {
        setFilterOptions((current) => current);
      });
  }, [branch, serviceArea]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      center: [37.8, 0.25],
      zoom: 5.8,
      minZoom: 5,
      maxZoom: 18,
      style: {
        version: 8,
        sources: {
          osm: {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution:
              '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#071018" }
          },
          {
            id: "osm",
            type: "raster",
            source: "osm",
            paint: {
              "raster-opacity": 0.62,
              "raster-saturation": -0.72,
              "raster-contrast": 0.22,
              "raster-brightness-min": 0.08,
              "raster-brightness-max": 0.68
            }
          }
        ]
      }
    });

    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "bottom-right"
    );

    map.on("load", () => {
      map.addSource("transformers", {
        type: "geojson",
        data: emptyCollection,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 48
      });

      map.addSource("selected-asset", {
        type: "geojson",
        data: emptyCollection
      });

      map.addLayer({
        id: "cluster-halo",
        type: "circle",
        source: "transformers",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#22d3ee",
          "circle-radius": [
            "step",
            ["get", "point_count"],
            23,
            100,
            30,
            750,
            37
          ],
          "circle-opacity": 0.13,
          "circle-blur": 0.28
        }
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "transformers",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#22d3ee",
            100,
            "#0ea5e9",
            750,
            "#2563eb"
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            17,
            100,
            23,
            750,
            29
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#083344"
        }
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "transformers",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
          "text-font": ["Open Sans Bold"]
        },
        paint: { "text-color": "#ecfeff" }
      });

      map.addLayer({
        id: "transformer-halo",
        type: "circle",
        source: "transformers",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 9,
          "circle-color": "#22d3ee",
          "circle-opacity": 0.13
        }
      });

      map.addLayer({
        id: "transformer-points",
        type: "circle",
        source: "transformers",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 4.8,
          "circle-color": "#67e8f9",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#082f49",
          "circle-opacity": 0.98
        }
      });

      map.addLayer({
        id: "selected-asset-ring",
        type: "circle",
        source: "selected-asset",
        paint: {
          "circle-radius": 11,
          "circle-color": "#ffffff",
          "circle-opacity": 0.09,
          "circle-stroke-width": 3,
          "circle-stroke-color": "#f8fafc"
        }
      });

      loadAssetsRef.current();
    });

    map.on("moveend", () => {
      if (!searchQueryRef.current) loadAssetsRef.current();
    });

    map.on("click", "clusters", async (event) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: ["clusters"]
      });
      const feature = features[0];
      const clusterId = feature?.properties?.cluster_id;
      if (clusterId === undefined) return;

      const source = map.getSource("transformers") as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      const coordinates = (feature.geometry as GeoJSON.Point)
        .coordinates as [number, number];

      map.easeTo({ center: coordinates, zoom, duration: 700 });
    });

    map.on("click", "transformer-points", (event) => {
      const feature = event.features?.[0] as unknown as AssetFeature | undefined;
      if (!feature) return;
      setSelected(feature);
      syncSelectedSource(feature);
    });

    for (const layer of ["clusters", "transformer-points"]) {
      map.on("mouseenter", layer, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", layer, () => {
        map.getCanvas().style.cursor = "";
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [syncSelectedSource]);

  useEffect(() => {
    if (mapRef.current?.isStyleLoaded()) {
      loadAssets();
    }
  }, [branch, feeder, serviceArea, loadAssets]);

  const handleServiceAreaChange = (value: string) => {
    setServiceArea(value);
    setBranch("");
    setFeeder("");
    setSearchQuery("");
    setSearchInput("");
    setSelected(null);
    syncSelectedSource(null);
  };

  const handleBranchChange = (value: string) => {
    setBranch(value);
    setFeeder("");
    setSearchQuery("");
    setSearchInput("");
    setSelected(null);
    syncSelectedSource(null);
  };

  const handleFeederChange = (value: string) => {
    setFeeder(value);
    setSearchQuery("");
    setSearchInput("");
    setSelected(null);
    syncSelectedSource(null);
  };

  const resetFilters = () => {
    setServiceArea("");
    setBranch("");
    setFeeder("");
    setSearchInput("");
    setSearchQuery("");
    setSelected(null);
    syncSelectedSource(null);
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchInput.trim();
    if (query.length < 2) return;
    setSearchQuery(query);
    setSelected(null);
    syncSelectedSource(null);
  };

  const clearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setSelected(null);
    syncSelectedSource(null);
  };

  const closeDetails = () => {
    setSelected(null);
    syncSelectedSource(null);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-row">
            <div className="brand-mark">
              <Layers3 size={21} />
            </div>
            <div>
              <p className="eyebrow">GeoAsset Kenya</p>
              <h1>Grid Asset Explorer</h1>
            </div>
          </div>

          <p className="intro">
            Explore real public electricity infrastructure data through a spatial
            asset-management interface.
          </p>

          <div className="status-card">
            <div className="status-icon">
              <Activity size={17} />
            </div>
            <div>
              <strong>{message}</strong>
              <span>
                {visibleCount.toLocaleString()} transformer
                {visibleCount === 1 ? "" : "s"} returned
              </span>
            </div>
            {loading && <RefreshCw size={16} className="spin" />}
          </div>

          <form className="search-form" onSubmit={handleSearch}>
            <Search size={15} />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Reference, road, feeder, location…"
              aria-label="Search transformer assets"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="search-clear"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </form>

          <section className="filter-section">
            <div className="section-title">
              <Filter size={15} />
              <span>Map filters</span>
            </div>

            <label>
              Service area
              <select
                value={serviceArea}
                onChange={(event) => handleServiceAreaChange(event.target.value)}
              >
                <option value="">All service areas</option>
                {filterOptions.service_areas.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Branch
              <select
                value={branch}
                onChange={(event) => handleBranchChange(event.target.value)}
                disabled={!serviceArea && filterOptions.branches.length === 0}
              >
                <option value="">All branches</option>
                {filterOptions.branches.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Feeder
              <select
                value={feeder}
                onChange={(event) => handleFeederChange(event.target.value)}
              >
                <option value="">All feeders</option>
                {filterOptions.feeders.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <button className="secondary-button" onClick={resetFilters} type="button">
              Clear filters
            </button>
          </section>

          <section className="metric-grid">
            <div className="metric-card">
              <Database size={16} />
              <strong>57,360</strong>
              <span>loaded assets</span>
            </div>
            <div className="metric-card">
              <MapPin size={16} />
              <strong>PostGIS</strong>
              <span>spatial backend</span>
            </div>
          </section>
        </div>

        <div className="source-note">
          Infrastructure source: ENERGYDATA.INFO / World Bank Group, attributed
          on the portal to KPLC. Operational condition fields remain demo-only.
        </div>
      </aside>

      <section className="map-panel">
        <div ref={mapContainer} className="map" />

        <div className="map-topbar">
          <div>
            <span className="live-dot" />
            Distribution transformers
          </div>
          <div className="map-topbar-meta">
            <LocateFixed size={13} />
            <span>{searchQuery ? "Search mode" : "Viewport query"}</span>
          </div>
        </div>

        {selected && (
          <aside className="detail-drawer">
            <button
              className="close-button"
              onClick={closeDetails}
              aria-label="Close asset details"
            >
              <X size={18} />
            </button>

            <p className="eyebrow">Transformer asset</p>
            <h2>
              {selected.properties.asset_reference ||
                `Asset ${selected.properties.source_id ?? ""}`}
            </h2>

            <div className="coordinate-row">
              {selected.geometry.coordinates[1].toFixed(5)},{" "}
              {selected.geometry.coordinates[0].toFixed(5)}
            </div>

            <div className="asset-summary">
              <span>{selected.properties.service_area || "Service area unavailable"}</span>
              <span>{selected.properties.branch || "Branch unavailable"}</span>
            </div>

            <dl>
              <Detail label="Feeder" value={selected.properties.feeder} />
              <Detail label="Structure" value={selected.properties.asset_structure} />
              <Detail
                label="Environment"
                value={selected.properties.installation_environment}
              />
              <Detail label="Isolation" value={selected.properties.isolation_type} />
              <Detail
                label="Road"
                value={
                  selected.properties.road_name || selected.properties.street_name
                }
              />
              <Detail
                label="Location"
                value={selected.properties.location_description}
              />
            </dl>

            <div className="provenance">
              <strong>Data provenance</strong>
              <span>
                {selected.properties.source_name ??
                  "Public infrastructure dataset"}
              </span>
              <span>
                License:{" "}
                {selected.properties.source_license ??
                  "See repository documentation"}
              </span>
            </div>
          </aside>
        )}
      </section>
    </main>
  );
}

function Detail({
  label,
  value
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "Not provided"}</dd>
    </div>
  );
}

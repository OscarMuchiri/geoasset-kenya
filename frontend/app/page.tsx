"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import AssetOperations from "../components/AssetOperations";
import {
  Activity,
  BarChart3,
  Database,
  Filter,
  Layers3,
  LocateFixed,
  MapPin,
  RefreshCw,
  Search,
  X,
  Zap
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

type FeatureProperties = {
  asset_id?: string | null;
  source_id?: string | null;
  asset_type?: string | null;
  asset_type_name?: string | null;
  name?: string | null;
  voltage_kv?: number | null;
  region?: string | null;
  service_area?: string | null;
  branch?: string | null;
  feeder?: string | null;
  asset_reference?: string | null;
  asset_structure?: string | null;
  dcs_category?: string | null;
  origin_area?: string | null;
  installation_environment?: string | null;
  isolation_type?: string | null;
  road_name?: string | null;
  street_name?: string | null;
  location_description?: string | null;
  status?: string | null;
  condition?: string | null;
  maintenance_priority?: string | null;
  source_name?: string | null;
  source_license?: string | null;
  source_properties?: Record<string, unknown> | null;
};

type AssetFeature = GeoJSON.Feature<GeoJSON.Point, FeatureProperties>;

type NetworkProperties = {
  source_id?: string | null;
  name?: string | null;
  voltage_kv?: number | null;
  network_class?: string | null;
  source_name?: string | null;
  source_license?: string | null;
  source_properties?: Record<string, unknown> | null;
};

type NetworkFeature = GeoJSON.Feature<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  NetworkProperties
>;

type SelectedItem =
  | { kind: "asset"; feature: AssetFeature }
  | { kind: "network"; feature: NetworkFeature }
  | null;

type FilterOptions = {
  service_areas: string[];
  branches: string[];
  feeders: string[];
};


type AnalyticsSummary = {
  transformers: {
    total: number;
    scope_count: number;
    service_areas: number;
    branches: number;
    feeders: number;
  };
  stations: { total: number };
  network: {
    feature_count: number;
    length_km: number;
    classes: Array<{
      network_class: string;
      voltage_kv: number | null;
      feature_count: number;
      length_km: number;
    }>;
  };
  top_service_areas: Array<{ label: string; value: number }>;
  top_branches: Array<{ label: string; value: number }>;
};

type LayerVisibility = {
  transformers: boolean;
  stations: boolean;
  network: boolean;
};

const emptyPoints: GeoJSON.FeatureCollection<GeoJSON.Point, FeatureProperties> = {
  type: "FeatureCollection",
  features: []
};

const emptyLines: GeoJSON.FeatureCollection<
  GeoJSON.LineString | GeoJSON.MultiLineString,
  NetworkProperties
> = {
  type: "FeatureCollection",
  features: []
};

const TRANSFORMER_LAYERS = [
  "cluster-halo",
  "clusters",
  "cluster-count",
  "transformer-halo",
  "transformer-condition-ring",
  "transformer-points"
];
const STATION_LAYERS = ["station-halo", "station-condition-ring", "station-points"];
const NETWORK_LAYERS = ["network-lines", "network-lines-highlight"];

export default function HomePage() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadTransformersRef = useRef<() => Promise<void>>(async () => {});
  const searchQueryRef = useRef("");

  const [selected, setSelected] = useState<SelectedItem>(null);
  const [serviceArea, setServiceArea] = useState("");
  const [branch, setBranch] = useState("");
  const [feeder, setFeeder] = useState("");
  const [operationalStatus, setOperationalStatus] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    service_areas: [],
    branches: [],
    feeders: []
  });
  const [visibleCount, setVisibleCount] = useState(0);
  const [stationCount, setStationCount] = useState(0);
  const [networkCount, setNetworkCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Loading infrastructure…");
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [layers, setLayers] = useState<LayerVisibility>({
    transformers: true,
    stations: true,
    network: true
  });

  const syncSelectedPoint = useCallback((feature: AssetFeature | null) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("selected-asset") as GeoJSONSource | undefined;
    source?.setData(
      feature
        ? { type: "FeatureCollection", features: [feature] }
        : emptyPoints
    );
  }, []);

  const syncSelectedLine = useCallback((feature: NetworkFeature | null) => {
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("selected-network") as GeoJSONSource | undefined;
    source?.setData(
      feature
        ? { type: "FeatureCollection", features: [feature] }
        : emptyLines
    );
  }, []);

  const loadTransformers = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const params = new URLSearchParams({
      asset_type: "distribution_transformer",
      limit: "5000"
    });

    if (serviceArea) params.set("service_area", serviceArea);
    if (branch) params.set("branch", branch);
    if (feeder) params.set("feeder", feeder);
    if (operationalStatus) params.set("status", operationalStatus);
    if (conditionFilter) params.set("condition", conditionFilter);
    if (priorityFilter) params.set("maintenance_priority", priorityFilter);

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
        if (first) {
          const [longitude, latitude] = first.geometry.coordinates;
          map.easeTo({
            center: [longitude, latitude],
            zoom: Math.max(map.getZoom(), 12.5),
            duration: 900
          });
          setSelected({ kind: "asset", feature: first });
          syncSelectedPoint(first);
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
  }, [branch, conditionFilter, feeder, operationalStatus, priorityFilter, searchQuery, serviceArea, syncSelectedPoint]);

  const loadInfrastructure = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    try {
      const stationParams = new URLSearchParams({
        asset_type: "transmission_station",
        limit: "500"
      });
      if (operationalStatus) stationParams.set("status", operationalStatus);
      if (conditionFilter) stationParams.set("condition", conditionFilter);
      if (priorityFilter) stationParams.set("maintenance_priority", priorityFilter);

      const stationsResponse = await fetch(
        `${API_URL}/assets?${stationParams.toString()}`
      );

      if (!stationsResponse.ok) {
        throw new Error(`Station API returned ${stationsResponse.status}`);
      }

      const stations = await stationsResponse.json();
      (map.getSource("stations") as GeoJSONSource | undefined)?.setData(stations);
      setStationCount(stations?.meta?.count ?? stations?.features?.length ?? 0);
    } catch (error) {
      console.error("Could not load transmission stations", error);
    }

    try {
      const networkResponse = await fetch(`${API_URL}/network-lines?limit=5000`);

      if (!networkResponse.ok) {
        throw new Error(`Network API returned ${networkResponse.status}`);
      }

      const network = await networkResponse.json();
      (map.getSource("network") as GeoJSONSource | undefined)?.setData(network);
      setNetworkCount(network?.meta?.count ?? network?.features?.length ?? 0);
    } catch (error) {
      console.error("Could not load transmission network", error);
    }
  }, [conditionFilter, operationalStatus, priorityFilter]);

  useEffect(() => {
    loadTransformersRef.current = loadTransformers;
    searchQueryRef.current = searchQuery;
  }, [loadTransformers, searchQuery]);

  useEffect(() => {
    const tryLoadInfrastructure = () => {
      const map = mapRef.current;
      if (
        !map ||
        !map.isStyleLoaded() ||
        !map.getSource("stations") ||
        !map.getSource("network")
      ) {
        return false;
      }

      void loadInfrastructure();
      return true;
    };

    if (tryLoadInfrastructure()) return;

    const interval = window.setInterval(() => {
      if (tryLoadInfrastructure()) {
        window.clearInterval(interval);
      }
    }, 300);

    return () => window.clearInterval(interval);
  }, [loadInfrastructure]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (serviceArea) params.set("service_area", serviceArea);
    if (branch) params.set("branch", branch);

    fetch(`${API_URL}/assets/filter-options?${params.toString()}`)
      .then((response) => response.json())
      .then((data) => setFilterOptions(data))
      .catch(() => undefined);
  }, [branch, serviceArea]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (serviceArea) params.set("service_area", serviceArea);
    if (branch) params.set("branch", branch);
    if (feeder) params.set("feeder", feeder);

    fetch(`${API_URL}/analytics/summary?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error("Analytics request failed");
        return response.json();
      })
      .then((data) => setAnalytics(data))
      .catch((error) => console.error("Could not load analytics", error));
  }, [branch, feeder, serviceArea]);

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
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");

    map.on("load", () => {
      map.addSource("network", { type: "geojson", data: emptyLines });
      map.addSource("transformers", {
        type: "geojson",
        data: emptyPoints,
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 48
      });
      map.addSource("stations", { type: "geojson", data: emptyPoints });
      map.addSource("selected-asset", { type: "geojson", data: emptyPoints });
      map.addSource("selected-network", { type: "geojson", data: emptyLines });

      map.addLayer({
        id: "network-lines",
        type: "line",
        source: "network",
        paint: {
          "line-color": [
            "match",
            ["get", "network_class"],
            "66kV", "#34d399",
            "132kV", "#f59e0b",
            "220kV", "#f43f5e",
            "#94a3b8"
          ],
          "line-width": [
            "match",
            ["get", "network_class"],
            "66kV", 2,
            "132kV", 2.8,
            "220kV", 3.8,
            1.8
          ],
          "line-opacity": 0.9
        }
      });

      map.addLayer({
        id: "network-lines-highlight",
        type: "line",
        source: "network",
        paint: {
          "line-color": "#ffffff",
          "line-width": 8,
          "line-opacity": 0
        }
      });

      map.addLayer({
        id: "selected-network-line",
        type: "line",
        source: "selected-network",
        paint: {
          "line-color": "#f8fafc",
          "line-width": 7,
          "line-opacity": 0.78,
          "line-blur": 0.35
        }
      });

      map.addLayer({
        id: "cluster-halo",
        type: "circle",
        source: "transformers",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#22d3ee",
          "circle-radius": ["step", ["get", "point_count"], 18, 100, 24, 750, 30],
          "circle-opacity": 0.08,
          "circle-blur": 0.34
        }
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "transformers",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": ["step", ["get", "point_count"], "#22d3ee", 100, "#0ea5e9", 750, "#2563eb"],
          "circle-radius": ["step", ["get", "point_count"], 13, 100, 18, 750, 23],
          "circle-opacity": 0.7,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#0f3b4c"
        }
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "transformers",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 10.5,
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
          "circle-radius": 7,
          "circle-color": "#22d3ee",
          "circle-opacity": 0.07
        }
      });

      map.addLayer({
        id: "transformer-condition-ring",
        type: "circle",
        source: "transformers",
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          [
            "any",
            ["in", ["coalesce", ["get", "condition"], "unknown"], ["literal", ["good", "fair", "poor", "critical"]]],
            ["in", ["coalesce", ["get", "status"], "unknown"], ["literal", ["active", "attention", "maintenance_planned", "out_of_service"]]]
          ]
        ],
        paint: {
          "circle-radius": 8.4,
          "circle-color": "#000000",
          "circle-opacity": 0,
          "circle-stroke-width": 2.4,
          "circle-stroke-color": [
            "match",
            ["coalesce", ["get", "condition"], "unknown"],
            "good", "#22c55e",
            "fair", "#eab308",
            "poor", "#f97316",
            "critical", "#ef4444",
            [
              "match",
              ["coalesce", ["get", "status"], "unknown"],
              "active", "#22c55e",
              "attention", "#f59e0b",
              "maintenance_planned", "#f59e0b",
              "out_of_service", "#ef4444",
              "#64748b"
            ]
          ],
          "circle-stroke-opacity": 0.98
        }
      });

      map.addLayer({
        id: "transformer-points",
        type: "circle",
        source: "transformers",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 3.8,
          "circle-color": "#67e8f9",
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "#082f49",
          "circle-opacity": 0.82
        }
      });

      map.addLayer({
        id: "station-halo",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": 13,
          "circle-color": "#f59e0b",
          "circle-opacity": 0.2
        }
      });

      map.addLayer({
        id: "station-condition-ring",
        type: "circle",
        source: "stations",
        filter: [
          "any",
          ["in", ["coalesce", ["get", "condition"], "unknown"], ["literal", ["good", "fair", "poor", "critical"]]],
          ["in", ["coalesce", ["get", "status"], "unknown"], ["literal", ["active", "attention", "maintenance_planned", "out_of_service"]]]
        ],
        paint: {
          "circle-radius": 12,
          "circle-color": "#000000",
          "circle-opacity": 0,
          "circle-stroke-width": 3,
          "circle-stroke-color": [
            "match",
            ["coalesce", ["get", "condition"], "unknown"],
            "good", "#22c55e",
            "fair", "#eab308",
            "poor", "#f97316",
            "critical", "#ef4444",
            [
              "match",
              ["coalesce", ["get", "status"], "unknown"],
              "active", "#22c55e",
              "attention", "#f59e0b",
              "maintenance_planned", "#f59e0b",
              "out_of_service", "#ef4444",
              "#64748b"
            ]
          ],
          "circle-stroke-opacity": 0.98
        }
      });

      map.addLayer({
        id: "station-points",
        type: "circle",
        source: "stations",
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "voltage_kv"], 66],
            66, 6,
            132, 7.5,
            220, 9
          ],
          "circle-color": "#fff1b8",
          "circle-stroke-width": 2.2,
          "circle-stroke-color": "#b45309",
          "circle-opacity": 0.98
        }
      });

      map.addLayer({
        id: "selected-asset-ring",
        type: "circle",
        source: "selected-asset",
        paint: {
          "circle-radius": 16,
          "circle-color": "#ffffff",
          "circle-opacity": 0,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#f8fafc",
          "circle-stroke-opacity": 0.78
        }
      });

      loadTransformersRef.current();
      loadInfrastructure();
    });

    map.on("moveend", () => {
      if (!searchQueryRef.current) loadTransformersRef.current();
    });

    map.on("click", "clusters", async (event) => {
      const feature = map.queryRenderedFeatures(event.point, { layers: ["clusters"] })[0];
      const clusterId = feature?.properties?.cluster_id;
      if (clusterId === undefined) return;
      const source = map.getSource("transformers") as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      map.easeTo({ center: coordinates, zoom, duration: 700 });
    });

    map.on("click", "transformer-points", (event) => {
      const feature = event.features?.[0] as unknown as AssetFeature | undefined;
      if (!feature) return;
      setSelected({ kind: "asset", feature });
      setAnalyticsOpen(false);
      syncSelectedPoint(feature);
      syncSelectedLine(null);
    });

    map.on("click", "station-points", (event) => {
      const feature = event.features?.[0] as unknown as AssetFeature | undefined;
      if (!feature) return;
      setSelected({ kind: "asset", feature });
      setAnalyticsOpen(false);
      syncSelectedPoint(feature);
      syncSelectedLine(null);
    });

    map.on("click", "network-lines", (event) => {
      const feature = event.features?.[0] as unknown as NetworkFeature | undefined;
      if (!feature) return;
      setSelected({ kind: "network", feature });
      setAnalyticsOpen(false);
      syncSelectedPoint(null);
      syncSelectedLine(feature);
    });

    for (const layer of ["clusters", "transformer-points", "station-points", "network-lines"]) {
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
  }, [loadInfrastructure, syncSelectedLine, syncSelectedPoint]);

  useEffect(() => {
    if (mapRef.current?.isStyleLoaded()) loadTransformers();
  }, [branch, feeder, serviceArea, loadTransformers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    const visibility = (value: boolean) => (value ? "visible" : "none");
    for (const id of TRANSFORMER_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility(layers.transformers));
    }
    for (const id of STATION_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility(layers.stations));
    }
    for (const id of NETWORK_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility(layers.network));
    }
  }, [layers]);

  const focusScope = useCallback(async ({
    serviceArea: nextServiceArea,
    branch: nextBranch,
    feeder: nextFeeder
  }: {
    serviceArea?: string;
    branch?: string;
    feeder?: string;
  }) => {
    const map = mapRef.current;
    if (!map) return;

    const params = new URLSearchParams({
      asset_type: "distribution_transformer"
    });
    if (nextServiceArea) params.set("service_area", nextServiceArea);
    if (nextBranch) params.set("branch", nextBranch);
    if (nextFeeder) params.set("feeder", nextFeeder);

    try {
      const response = await fetch(`${API_URL}/assets/bounds?${params.toString()}`);
      if (!response.ok) throw new Error(`Bounds API returned ${response.status}`);
      const bounds = await response.json();

      const samePoint =
        bounds.min_lon === bounds.max_lon && bounds.min_lat === bounds.max_lat;

      if (samePoint) {
        map.easeTo({
          center: [bounds.min_lon, bounds.min_lat],
          zoom: 13,
          duration: 850
        });
      } else {
        map.fitBounds(
          [
            [bounds.min_lon, bounds.min_lat],
            [bounds.max_lon, bounds.max_lat]
          ],
          {
            padding: { top: 100, right: 90, bottom: 70, left: 90 },
            maxZoom: 12.5,
            duration: 900
          }
        );
      }
    } catch (error) {
      console.error("Could not focus selected analytics scope", error);
    }
  }, []);

  const resetFilters = () => {
    setServiceArea("");
    setBranch("");
    setFeeder("");
    setOperationalStatus("");
    setConditionFilter("");
    setPriorityFilter("");
    setSearchInput("");
    setSearchQuery("");
    setSelected(null);
    syncSelectedPoint(null);
    syncSelectedLine(null);
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchInput.trim();
    if (query.length < 2) return;
    setSearchQuery(query);
    setSelected(null);
    syncSelectedPoint(null);
    syncSelectedLine(null);
  };

  const closeDetails = () => {
    setSelected(null);
    syncSelectedPoint(null);
    syncSelectedLine(null);
  };

  const handleOperationalStateChange = useCallback((state: {
    status: string;
    condition: string;
    maintenance_priority: string;
    asset_type: string;
  }) => {
    setSelected((current) => {
      if (!current || current.kind !== "asset") return current;

      const updatedFeature: AssetFeature = {
        type: "Feature",
        id: current.feature.id,
        geometry: current.feature.geometry,
        properties: {
          ...current.feature.properties,
          status: state.status,
          condition: state.condition,
          maintenance_priority: state.maintenance_priority
        }
      };

      syncSelectedPoint(updatedFeature);
      return { kind: "asset", feature: updatedFeature };
    });

    if (state.asset_type === "transmission_station") {
      void loadInfrastructure();
    } else {
      void loadTransformersRef.current();
    }
  }, [loadInfrastructure, syncSelectedPoint]);

  const toggleLayer = (key: keyof LayerVisibility) => {
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-row">
            <div className="brand-mark"><Layers3 size={21} /></div>
            <div>
              <p className="eyebrow">GeoAsset Kenya</p>
              <h1>Grid Asset Explorer</h1>
            </div>
          </div>

          <p className="intro">
            Explore public electricity infrastructure through a spatial asset-management interface.
          </p>

          <div className="status-card">
            <div className="status-icon"><Activity size={17} /></div>
            <div>
              <strong>{message}</strong>
              <span>{visibleCount.toLocaleString()} transformers returned</span>
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
              <button type="button" onClick={() => { setSearchInput(""); setSearchQuery(""); }} className="search-clear" aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </form>

          <section className="layer-section">
            <div className="section-title"><Layers3 size={15} /><span>Map layers</span></div>
            <LayerToggle
              label="Distribution transformers"
              detail="57,360 assets"
              active={layers.transformers}
              swatch="transformer"
              onClick={() => toggleLayer("transformers")}
            />
            <LayerToggle
              label="Transmission stations"
              detail={`${stationCount || 83} stations`}
              active={layers.stations}
              swatch="station"
              onClick={() => toggleLayer("stations")}
            />
            <LayerToggle
              label="Transmission network"
              detail={`${networkCount || 346} line features`}
              active={layers.network}
              swatch="network"
              onClick={() => toggleLayer("network")}
            />
            <div className="network-legend">
              <span><i className="line-66" />66 kV</span>
              <span><i className="line-132" />132 kV</span>
              <span><i className="line-220" />220 kV</span>
            </div>
            <div className="condition-legend" aria-label="Demo operational condition legend">
              <span className="condition-legend-title">Demo condition</span>
              <span><i className="condition-good" />Good</span>
              <span><i className="condition-fair" />Fair</span>
              <span><i className="condition-poor" />Poor</span>
              <span><i className="condition-critical" />Critical</span>
            </div>
          </section>

          <section className="filter-section">
            <div className="section-title"><Filter size={15} /><span>Transformer filters</span></div>

            <label>
              Service area
              <select value={serviceArea} onChange={(e) => { setServiceArea(e.target.value); setBranch(""); setFeeder(""); }}>
                <option value="">All service areas</option>
                {filterOptions.service_areas.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>

            <label>
              Branch
              <select value={branch} onChange={(e) => { setBranch(e.target.value); setFeeder(""); }}>
                <option value="">All branches</option>
                {filterOptions.branches.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>

            <label>
              Feeder
              <select value={feeder} onChange={(e) => setFeeder(e.target.value)}>
                <option value="">All feeders</option>
                {filterOptions.feeders.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>

            <button className="secondary-button" onClick={resetFilters} type="button">Clear filters</button>
          </section>

          <section className="filter-section demo-filter-section">
            <div className="section-title"><Activity size={15} /><span>Demo operations</span></div>

            <label>
              Status
              <select value={operationalStatus} onChange={(e) => setOperationalStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="attention">Attention</option>
                <option value="maintenance_planned">Maintenance planned</option>
                <option value="out_of_service">Out of service</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>

            <label>
              Condition
              <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)}>
                <option value="">All conditions</option>
                <option value="good">Good</option>
                <option value="fair">Fair</option>
                <option value="poor">Poor</option>
                <option value="critical">Critical</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>

            <label>
              Maintenance priority
              <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="">All priorities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="unassigned">Unassigned</option>
              </select>
            </label>
          </section>

          <section className="metric-grid">
            <div className="metric-card"><Database size={16} /><strong>57,443</strong><span>point assets</span></div>
            <div className="metric-card"><Zap size={16} /><strong>{networkCount || 346}</strong><span>network lines</span></div>
          </section>
        </div>

        <div className="source-note">
          Public infrastructure sources: ENERGYDATA.INFO / World Bank Group. Operational condition fields remain demo-only.
        </div>
      </aside>

      <section className="map-panel">
        <div ref={mapContainer} className="map" />

        <div className="map-topbar">
          <div><span className="live-dot" />Kenya electricity infrastructure</div>
          <div className="map-topbar-actions">
            <button
              type="button"
              className={`topbar-action ${analyticsOpen ? "active" : ""}`}
              onClick={() => {
                setSelected(null);
                syncSelectedPoint(null);
                syncSelectedLine(null);
                setAnalyticsOpen((open) => !open);
              }}
            >
              <BarChart3 size={13} />
              Analytics
            </button>
            <div className="map-topbar-meta"><LocateFixed size={13} /><span>{searchQuery ? "Search mode" : "Viewport query"}</span></div>
          </div>
        </div>

        {!selected && analyticsOpen && analytics && (
          <AnalyticsPanel
            analytics={analytics}
            serviceArea={serviceArea}
            branch={branch}
            feeder={feeder}
            onSelectServiceArea={(value) => {
              setServiceArea(value);
              setBranch("");
              setFeeder("");
              setSearchInput("");
              setSearchQuery("");
              setSelected(null);
              syncSelectedPoint(null);
              syncSelectedLine(null);
              setAnalyticsOpen(false);
              void focusScope({ serviceArea: value });
            }}
            onSelectBranch={(value) => {
              const scopedServiceArea = serviceArea || undefined;
              setBranch(value);
              setFeeder("");
              setSearchInput("");
              setSearchQuery("");
              setSelected(null);
              syncSelectedPoint(null);
              syncSelectedLine(null);
              setAnalyticsOpen(false);
              void focusScope({ serviceArea: scopedServiceArea, branch: value });
            }}
            onClose={() => setAnalyticsOpen(false)}
          />
        )}

        {selected && (
          <DetailDrawer
            selected={selected}
            onClose={closeDetails}
            onAssetStateChange={handleOperationalStateChange}
          />
        )}
      </section>
    </main>
  );
}

function AnalyticsPanel({
  analytics,
  serviceArea,
  branch,
  feeder,
  onSelectServiceArea,
  onSelectBranch,
  onClose
}: {
  analytics: AnalyticsSummary;
  serviceArea: string;
  branch: string;
  feeder: string;
  onSelectServiceArea: (value: string) => void;
  onSelectBranch: (value: string) => void;
  onClose: () => void;
}) {
  const maxArea = Math.max(...analytics.top_service_areas.map((item) => item.value), 1);
  const maxBranch = Math.max(...analytics.top_branches.map((item) => item.value), 1);
  const scopeLabel = feeder || branch || serviceArea || "All transformers";

  return (
    <aside className="analytics-panel">
      <button className="close-button" onClick={onClose} aria-label="Close analytics"><X size={18} /></button>
      <p className="eyebrow">Infrastructure analytics</p>
      <h2>System snapshot</h2>
      <p className="analytics-scope">{scopeLabel}</p>

      <div className="analytics-kpis">
        <AnalyticsKpi label="Transformer scope" value={analytics.transformers.scope_count.toLocaleString()} />
        <AnalyticsKpi label="Stations" value={analytics.stations.total.toLocaleString()} />
        <AnalyticsKpi label="Network segments" value={analytics.network.feature_count.toLocaleString()} />
        <AnalyticsKpi label="Network length" value={`${analytics.network.length_km.toLocaleString()} km`} />
      </div>

      <div className="analytics-footprint">
        <span><strong>{analytics.transformers.service_areas}</strong> service areas</span>
        <span><strong>{analytics.transformers.branches}</strong> branches</span>
        <span><strong>{analytics.transformers.feeders}</strong> feeders</span>
      </div>

      <section className="analytics-section">
        <h3>Transmission network</h3>
        {analytics.network.classes.map((item) => (
          <div className="voltage-row" key={item.network_class}>
            <span className={`voltage-line voltage-${item.network_class.replace("kV", "")}`} />
            <div>
              <strong>{item.network_class}</strong>
              <small>{item.feature_count} segments</small>
            </div>
            <b>{item.length_km.toLocaleString()} km</b>
          </div>
        ))}
      </section>

      <AnalyticsRanking
        title="Largest service areas"
        items={analytics.top_service_areas}
        maxValue={maxArea}
        onSelect={onSelectServiceArea}
      />

      <AnalyticsRanking
        title={serviceArea ? "Largest branches in scope" : "Largest branches"}
        items={analytics.top_branches}
        maxValue={maxBranch}
        onSelect={onSelectBranch}
      />
    </aside>
  );
}

function AnalyticsKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="analytics-kpi">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function AnalyticsRanking({
  title,
  items,
  maxValue,
  onSelect
}: {
  title: string;
  items: Array<{ label: string; value: number }>;
  maxValue: number;
  onSelect: (value: string) => void;
}) {
  return (
    <section className="analytics-section">
      <h3>{title}</h3>
      <div className="ranking-list">
        {items.map((item) => (
          <button
            type="button"
            className="ranking-row"
            key={item.label}
            onClick={() => onSelect(item.label)}
            title={`Filter map to ${item.label}`}
          >
            <div className="ranking-heading">
              <span>{item.label}</span>
              <strong>{item.value.toLocaleString()}</strong>
            </div>
            <div className="ranking-track">
              <i style={{ width: `${Math.max(4, (item.value / maxValue) * 100)}%` }} />
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function LayerToggle({
  label,
  detail,
  active,
  swatch,
  onClick
}: {
  label: string;
  detail: string;
  active: boolean;
  swatch: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`layer-toggle ${active ? "active" : ""}`} onClick={onClick}>
      <span className={`layer-swatch ${swatch}`} />
      <span className="layer-copy"><strong>{label}</strong><small>{detail}</small></span>
      <span className="layer-state">{active ? "On" : "Off"}</span>
    </button>
  );
}

function DetailDrawer({
  selected,
  onClose,
  onAssetStateChange
}: {
  selected: Exclude<SelectedItem, null>;
  onClose: () => void;
  onAssetStateChange: (state: {
    status: string;
    condition: string;
    maintenance_priority: string;
    asset_type: string;
  }) => void;
}) {
  if (selected.kind === "network") {
    const p = selected.feature.properties;
    return (
      <aside className="detail-drawer">
        <button className="close-button" onClick={onClose} aria-label="Close details"><X size={18} /></button>
        <p className="eyebrow">Transmission network</p>
        <h2>{p.network_class || "Network segment"}</h2>
        <div className="asset-summary">
          <span>{p.voltage_kv ? `${p.voltage_kv} kV` : "Voltage not provided"}</span>
        </div>
        <dl>
          <Detail label="Name" value={p.name} />
          <Detail label="Feeder" value={rawText(p.source_properties, ["Feeder_o10", "Feeder_o17"])} />
          <Detail label="Branch" value={rawText(p.source_properties, ["Branch3"])} />
          <Detail label="County / area" value={rawText(p.source_properties, ["County2"])} />
          <Detail label="Length" value={withUnit(rawText(p.source_properties, ["Length_km"]), " km")} />
          <Detail label="Source ID" value={p.source_id} />
        </dl>
        <div className="provenance">
          <strong>Data provenance</strong>
          <span>{p.source_name || "Public electricity network dataset"}</span>
          <span>License: {p.source_license || "See repository documentation"}</span>
        </div>
      </aside>
    );
  }

  const feature = selected.feature;
  const p = feature.properties;
  const isStation = p.asset_type === "transmission_station" || p.asset_type_name === "Transmission Station";

  return (
    <aside className="detail-drawer">
      <button className="close-button" onClick={onClose} aria-label="Close details"><X size={18} /></button>
      <p className="eyebrow">{isStation ? "Transmission station" : "Transformer asset"}</p>
      <h2>{p.name || p.asset_reference || `Asset ${p.source_id ?? ""}`}</h2>
      <div className="coordinate-row">
        {feature.geometry.coordinates[1].toFixed(5)}, {feature.geometry.coordinates[0].toFixed(5)}
      </div>
      <div className="asset-summary">
        {p.voltage_kv && <span>{p.voltage_kv} kV</span>}
        <span>{p.service_area || "Service area unavailable"}</span>
        <span>{p.branch || "Branch unavailable"}</span>
      </div>
      <dl>
        {isStation && <Detail label="Region" value={p.region} />}
        {isStation && <Detail label="Ownership" value={rawText(p.source_properties, ["Ownership23"])} />}
        {!isStation && <Detail label="Feeder" value={p.feeder} />}
        {!isStation && <Detail label="Structure" value={p.asset_structure} />}
        {!isStation && <Detail label="DCS category" value={p.dcs_category} />}
        <Detail label="Road" value={p.road_name || p.street_name} />
        <Detail label="Location" value={p.location_description} />
        <Detail label="Status" value={p.status} />
        <Detail label="Condition" value={p.condition} />
      </dl>
      {(p.asset_id || feature.id !== undefined && feature.id !== null) && (
        <AssetOperations
          assetId={String(p.asset_id || feature.id)}
          onStateChange={onAssetStateChange}
        />
      )}
      <div className="provenance">
        <strong>Data provenance</strong>
        <span>{p.source_name || "Public infrastructure dataset"}</span>
        <span>License: {p.source_license || "See repository documentation"}</span>
      </div>
    </aside>
  );
}

function rawText(
  source: Record<string, unknown> | null | undefined,
  keys: string[]
): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

function withUnit(value: string | null, unit: string): string | null {
  return value ? `${value}${unit}` : null;
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div><dt>{label}</dt><dd>{value || "Not provided"}</dd></div>;
}

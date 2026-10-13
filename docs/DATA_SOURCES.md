# Data Sources

GeoAsset Kenya uses public infrastructure datasets published through ENERGYDATA.INFO by the World Bank Group and attributed to Kenya Power and Lighting Company (KPLC).

## 1. Kenya — Distribution Transformers

- Dataset: https://energydata.info/dataset/kenya-distribution-transformers
- Provider noted by portal: Kenya Power and Lighting Company (KPLC)
- Format available: GeoJSON / SHP ZIP
- License: Creative Commons Attribution 4.0
- Intended use: primary point layer for transformer assets

## 2. Kenya — Primary Substations

- Dataset: https://energydata.info/dataset/kenya-primary-substations
- Provider noted by portal: Kenya Power and Lighting Company (KPLC)
- Formats available: JSON / ZIP
- License: Creative Commons Attribution 4.0
- Intended use: substation point layer

## 3. Kenya — Kenya Electricity Network

- Dataset: https://energydata.info/en/dataset/kenya-kenya-electricity-network
- Provider noted by portal: Kenya Power and Lighting Company (KPLC)
- Formats available: GeoJSON / SHP ZIP / vector tiles for selected voltage levels
- License: CC0 1.0
- Intended use: electricity-network line layers, including identified voltage classes and unidentified network segments

## 4. Kenya — Transmission Stations

- Dataset: https://energydata.info/dataset/kenya-transmission-stations
- Provider noted by portal: Kenya Power and Lighting Company (KPLC)
- Formats available: GeoJSON / SHP ZIP
- License: CC0 1.0
- Intended use: transmission-station point layer

## Data handling policy

Source geometries and source attributes will be preserved during ingestion. Application-only fields such as condition, inspection status and maintenance priority will be explicitly marked as **synthetic/demo operational data** unless they are backed by a separate authoritative source.

Large raw datasets are not stored in Git. The ingestion workflow will download or read them into `data/raw/`, normalize them, and load them into PostGIS.

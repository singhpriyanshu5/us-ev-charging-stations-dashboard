# EV Charging Infrastructure Dashboard — Implementation Summary

**Completed**: 2026-03-07
**Stack**: Snowflake + Airflow (Docker) + dbt + Preset.io
**Data**: NREL AFDC API (live, ~85,800 stations) + DOE EV registrations (manual CSV seed) + US Census ACS5 API

---

## What Was Built

### 1. Snowflake Setup
- Database: `EV_ANALYTICS` with 3 schemas: `raw`, `curated`, `analytics`
- RAW tables: `ev_stations`, `ev_registrations`, `census_population`
- Read-only role `dashboard_ro` for Preset.io connection (with USAGE on warehouse)
- Role used throughout: `ACCOUNTADMIN`

### 2. Airflow (Docker Compose)
4 DAGs running via LocalExecutor on PostgreSQL metadata DB:

| DAG | Schedule | Status |
|---|---|---|
| `nrel_stations_daily` | `@daily` | Live — pulls ~85,800 stations via CSV endpoint |
| `ev_registrations_historical` | `@once` | Complete — loaded 51 rows from seed CSV |
| `census_population_annual` | `@yearly` | Complete — loaded 52 rows from Census ACS5 API |
| `dbt_transform` | Triggered by DAG 1 | Live — runs dbt run + dbt test after each ingest |

Key DAG details:
- `nrel_stations_daily` uses a `ShortCircuitOperator` to skip pulls when NREL data hasn't changed
- Uses a two-step temp table approach to load data into Snowflake (required because `PARSE_JSON()` cannot be used in `executemany` VALUES clause)
- Triggers `dbt_transform` on completion via `TriggerDagRunOperator`

### 3. dbt Models
- **Seeds**: `dim_geography.csv` (51 rows — state/region/FIPS mapping) loaded into `raw` schema
- **Staging** (views in `curated` schema): `stg_ev_stations`, `stg_ev_registrations`, `stg_census_population`
- **Marts** (tables in `analytics` schema):

| Mart | Rows | Key Metrics |
|---|---|---|
| `fct_ev_stations_by_state` | 52 | total_stations, stations_with_dc_fast, total_level2_ports |
| `fct_ev_stations_by_city` | ~2,800 | total_stations per city |
| `fct_ev_density` | 52 | stations_per_100k, ports_per_100k |
| `fct_ev_adoption_vs_infrastructure` | 52 | evs_per_station (gap score), ev_adoption_rate |

- Custom `generate_schema_name` macro override ensures absolute schema names (not prefixed with target name)

### 4. Preset.io Dashboard
Connected to Snowflake `analytics` schema via `dashboard_ro` role.

7 charts assembled into one dashboard:

| Chart | Type | Dataset |
|---|---|---|
| EV Station Density by State | Choropleth (USA Map) | `fct_ev_density` |
| Top 15 States by EV Stations | Bar | `fct_ev_stations_by_state` |
| DC Fast vs L2-Only Stations — Top 10 States | Stacked Bar | `fct_ev_stations_by_state` |
| EV Adoption vs Infrastructure by State | Bubble Chart | `fct_ev_adoption_vs_infrastructure` |
| Infrastructure Gap Ranking by State | Bar | `fct_ev_adoption_vs_infrastructure` |
| Top 20 Cities by EV Stations | Bar | `fct_ev_stations_by_city` |
| KPI Tiles (×3) | Big Number | Various marts |

---

## Key Data Facts (as of 2026-03-07)

- Total US EV stations ingested: **85,800** (52 states/territories including DC + PR)
- Top state by station count: **CA — 20,600**
- Top state by density: **VT — 87.8 stations/100k**
- Most underserved state (highest EVs/station): **NV — 105 EVs per station**
- Top city: **Los Angeles, CA — 2,024 stations**
- Total EV registrations (2024): **~4.5M**

---

## Deviations from PLAN.md

### API / Data Ingestion

| # | Plan | Actual | Reason |
|---|---|---|---|
| 1 | NREL JSON API with `limit=10000` and pagination | CSV endpoint (`/v1.csv`) — single request, no pagination | NREL JSON API caps limit at 200 and silently ignores `offset`/`page` params — all pages return the same 200 stations. CSV endpoint is the only way to get full dataset. |
| 2 | DAG 2 designed as URL-based download | Manual CSV seed file (`data/ev_registrations_2024.csv`) loaded via dbt seed | AFDC has no programmatic API or direct CSV download URL; data must be manually copied from the web page. Plan notes this but DAG was still initially coded as a URL download. |

### Snowflake / dbt

| # | Plan | Actual | Reason |
|---|---|---|---|
| 3 | `USE ROLE SYSADMIN` in setup SQL | `USE ROLE ACCOUNTADMIN` throughout | New Snowflake trial accounts default to ACCOUNTADMIN; SYSADMIN doesn't own objects created by ACCOUNTADMIN and lacks privileges on them. |
| 4 | `GRANT USAGE ON SCHEMA analytics` only for `dashboard_ro` | Also added `GRANT USAGE ON WAREHOUSE COMPUTE_WH TO ROLE dashboard_ro` | Preset.io requires warehouse USAGE in addition to schema/table grants to establish a connection. |

### Dashboard (Preset.io)

| # | Plan | Actual | Reason |
|---|---|---|---|
| 5 | "EV Adoption vs Infrastructure" as Scatter Plot (`X=ev_count, Y=total_stations, color=gap_score`) | Bubble Chart (`X=ev_adoption_rate, Y=stations_per_100k, size=total_stations`) — single color | Preset's "Scatter" chart type is time-series only, not XY numeric. Bubble Chart used instead. Color-by-gap-score not achievable in Preset's Bubble Chart with Custom SQL dimension (collapses to NULL). |
| 6 | KPI tile: "gap count" (states with gap score > threshold) | KPI tile: `AVG(EVS_PER_STATION)` — national average gap score | "Gap count" requires a filtered COUNT which isn't directly expressible as a Big Number metric in Preset without a custom SQL dataset. Average gap score conveys equivalent insight more simply. |
| 7 | ISO 3166-2 field on choropleth accepts `STATE` (2-letter codes) | Requires `CONCAT('US-', STATE)` Custom SQL expression | Preset choropleth expects full ISO 3166-2 format (`US-CA`) not bare state abbreviations. |
| 8 | "Port Type Breakdown" — initially built as L2 ports vs DC fast ports count | Rebuilt as `stations_with_dc_fast` vs `L2-only stations` count | Initial implementation used port counts (`total_level2_ports`, `total_dc_fast_ports`), which contradicts the plan's explicit note to use `stations_with_dc_fast` from `ev_connector_types` (99.98% complete) rather than `ev_dc_fast_num` (82% null). Caught by re-reading PLAN.md. |

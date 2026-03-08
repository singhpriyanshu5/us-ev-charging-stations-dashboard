# EV Station Analytics Dashboard — End-to-End Implementation Plan

## Context
This project builds a full data analytics pipeline to surface insights about EV charging station
volume/density across US cities and states, and compares infrastructure availability against EV
adoption (registrations). The tech stack is Snowflake + Airflow + dbt + Preset.io.

---

## 1. Data Sources

### Source A: NREL Alternative Fuels Station API (Real-time / Daily)
- **URL**: `https://developer.nrel.gov/api/alt-fuel-stations/v1.json`
- **Auth**: Free API key at developer.nrel.gov
- **Filter**: `fuel_type=ELEC` (electric only), `country=US`
- **Key fields**: `id`, `station_name`, `city`, `state`, `zip`, `latitude`, `longitude`,
  `ev_level1_evse_num`, `ev_level2_evse_num`, `ev_dc_fast_num`, `ev_connector_types`,
  `status_code`, `open_date`, `updated_at`
- **Update cadence**: The AFDC dataset is refreshed daily by NREL. Networked stations
  (ChargePoint, EVgo, Blink, etc.) are auto-imported from network partners; non-networked
  stations are added manually and verified every other year — so those may be less current.
- **Last-updated endpoint**: `GET /api/alt-fuel-stations/v1/last-updated.json?api_key=KEY`
  — use this in the DAG to skip a full pull on days when data hasn't changed.
- **Role**: Real-time source — pulled daily by Airflow. Captures current station inventory.

### Source B: DOE/AFDC State EV Registration Data (Historical Archive)
- **URL**: https://afdc.energy.gov/vehicle-registration (downloadable CSVs by year)
- **Alternative**: Atlas EV Hub state registration API or Kaggle `ev-registration-counts-by-state` dataset
- **Key fields**: `state`, `year`, `ev_count`, `vehicle_type` (BEV/PHEV)
- **Role**: Historical archive source — one-time bulk load, then annual refresh.
  Covers 2016–2024 EV registrations by state.

### Source C: US Census Bureau API (Population — for density)
- **URL**: `https://api.census.gov/data/{year}/acs/acs5?get=NAME,B01003_001E&for=state:*`
- **Auth**: No key required for basic use
- **Key fields**: `state_name`, `state_fips`, `population`
- **Role**: Annual pull used to compute stations-per-capita and EVs-per-capita metrics.

---

## 2. Snowflake Schema Design

### DDL — RAW Schema (landing zone, no transforms)

```sql
CREATE SCHEMA IF NOT EXISTS raw;

-- NREL station data (full snapshot replaced daily)
CREATE TABLE raw.ev_stations (
    station_id          INTEGER,
    station_name        VARCHAR,
    city                VARCHAR,
    state               CHAR(2),
    zip                 VARCHAR,
    latitude            FLOAT,
    longitude           FLOAT,
    ev_level1_evse_num  INTEGER,
    ev_level2_evse_num  INTEGER,
    ev_dc_fast_num      INTEGER,
    ev_connector_types  VARIANT,      -- JSON array
    status_code         CHAR(1),      -- E=open, P=planned, T=temp unavail
    open_date           DATE,
    updated_at          TIMESTAMP,
    _ingested_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- DOE EV registration data by state and year
CREATE TABLE raw.ev_registrations (
    state               CHAR(2),
    state_name          VARCHAR,
    year                INTEGER,
    ev_count            INTEGER,
    vehicle_type        VARCHAR,      -- BEV, PHEV, or ALL
    _ingested_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Census population data by state
CREATE TABLE raw.census_population (
    state_fips          CHAR(2),
    state_name          VARCHAR,
    year                INTEGER,
    population          INTEGER,
    _ingested_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);
```

### DDL — CURATED Schema (dbt staging models)

```sql
CREATE SCHEMA IF NOT EXISTS curated;
-- Tables materialized by dbt staging models
```

### DDL — ANALYTICS Schema (dbt mart models)

```sql
CREATE SCHEMA IF NOT EXISTS analytics;
-- Tables materialized by dbt mart models

-- Read-only dashboarding role (connect Preset.io with this role)
CREATE ROLE IF NOT EXISTS dashboard_ro;
GRANT USAGE ON DATABASE <your_db> TO ROLE dashboard_ro;
GRANT USAGE ON SCHEMA analytics TO ROLE dashboard_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO ROLE dashboard_ro;
```

---

## 3. Project File Structure

```
ev-charging-stations-dashboard/
├── PLAN.md
├── airflow/
│   └── dags/
│       ├── dag_nrel_stations_daily.py
│       ├── dag_ev_registrations_historical.py
│       ├── dag_census_population_annual.py
│       └── dag_dbt_transform.py
├── dbt/
│   ├── dbt_project.yml
│   ├── profiles.yml
│   └── models/
│       ├── sources.yml
│       ├── staging/
│       │   ├── stg_ev_stations.sql
│       │   ├── stg_ev_registrations.sql
│       │   └── stg_census_population.sql
│       ├── marts/
│       │   ├── fct_ev_stations_by_state.sql
│       │   ├── fct_ev_stations_by_city.sql
│       │   ├── fct_ev_density.sql
│       │   └── fct_ev_adoption_vs_infrastructure.sql
│       └── dimensions/
│           └── dim_geography.sql
└── sql/
    └── snowflake_setup.sql
```

---

## 4. Airflow DAGs

### DAG 1: `dag_nrel_stations_daily.py` (real-time source)
- **Schedule**: `@daily`
- **Steps**:
  1. `PythonOperator` → call `last-updated` endpoint (`/v1/last-updated.json`); compare to last
     ingestion timestamp stored in Snowflake or Airflow XCom — skip remaining steps if unchanged
  2. `PythonOperator` → call full stations API (`fuel_type=ELEC&country=US&limit=10000`)
  3. Parse JSON response, flatten `ev_connector_types` to VARIANT
  4. `SnowflakeOperator` → `TRUNCATE TABLE raw.ev_stations` (full replace — API returns full current snapshot)
  5. `PythonOperator` → bulk insert via `snowflake-connector-python` using `executemany`

### DAG 2: `dag_ev_registrations_historical.py` (archive source)
- **Schedule**: `@once` (then `@yearly` for annual refresh)
- **Steps**:
  1. `PythonOperator` → download CSV files for years 2016–2024 from AFDC or S3 bucket
  2. Parse and normalize: state abbreviation, year, ev_count, vehicle_type
  3. `SnowflakeOperator` → load via `COPY INTO` or `executemany`

### DAG 3: `dag_census_population_annual.py`
- **Schedule**: `@yearly`
- **Steps**:
  1. `PythonOperator` → call Census ACS5 API for latest year
  2. Parse state FIPS + population
  3. `SnowflakeOperator` → upsert into `raw.census_population`

### DAG 4: `dag_dbt_transform.py`
- **Schedule**: `@daily` (triggered after DAG 1 via `TriggerDagRunOperator`)
- **Steps**:
  1. `BashOperator` → `dbt run --profiles-dir /path/to/profiles`
  2. `BashOperator` → `dbt test`

---

## 5. dbt Models

### `models/sources.yml`
Declares `raw.ev_stations`, `raw.ev_registrations`, `raw.census_population` as dbt sources.

### Staging Layer → materializes into CURATED schema

**`stg_ev_stations.sql`**
```sql
SELECT
    station_id,
    station_name,
    UPPER(TRIM(city))  AS city,
    state,
    zip,
    latitude,
    longitude,
    COALESCE(ev_level1_evse_num, 0) AS level1_ports,
    COALESCE(ev_level2_evse_num, 0) AS level2_ports,
    COALESCE(ev_dc_fast_num, 0)     AS dc_fast_ports,
    CASE status_code
        WHEN 'E' THEN 'Open'
        WHEN 'P' THEN 'Planned'
        ELSE 'Other'
    END AS status,
    open_date,
    updated_at
FROM {{ source('raw', 'ev_stations') }}
QUALIFY ROW_NUMBER() OVER (PARTITION BY station_id ORDER BY _ingested_at DESC) = 1
```

**`stg_ev_registrations.sql`**
- Clean state codes, filter to `vehicle_type = 'ALL'` or sum BEV+PHEV per state/year

**`stg_census_population.sql`**
- Clean state FIPS, keep latest year per state

### Mart Layer → materializes into ANALYTICS schema

**`fct_ev_stations_by_state.sql`**
```sql
SELECT
    state,
    COUNT(*)                                                 AS total_stations,
    SUM(level2_ports)                                        AS total_level2_ports,
    SUM(dc_fast_ports)                                       AS total_dc_fast_ports,
    SUM(level1_ports + level2_ports + dc_fast_ports)         AS total_ports,
    COUNT_IF(status = 'Open')                                AS open_stations,
    COUNT_IF(status = 'Planned')                             AS planned_stations,
    MIN(open_date)                                           AS first_station_date
FROM {{ ref('stg_ev_stations') }}
GROUP BY state
```

**`fct_ev_stations_by_city.sql`**
- Same aggregations grouped by `state, city`

**`fct_ev_density.sql`**
- Join `fct_ev_stations_by_state` + `stg_census_population`
- `stations_per_100k = total_stations / population * 100000`
- `ports_per_100k = total_ports / population * 100000`

**`fct_ev_adoption_vs_infrastructure.sql`**
- Join `fct_ev_stations_by_state` + `stg_ev_registrations` (latest year) + `fct_ev_density`
- `evs_per_station = ev_count / NULLIF(total_stations, 0)` → infrastructure gap ratio
- `ev_adoption_rate = ev_count / population * 100000` → EVs per 100k people
- `infrastructure_gap_score = evs_per_station` → higher = more underserved

**`dim_geography.sql`**
- Seed or derived table: `state_abbrev`, `state_name`, `region` (NE/SE/MW/W/SW), `area_sq_miles`

---

## 6. Dashboard (Preset.io)

Connect Preset.io to Snowflake `ANALYTICS` schema using the `dashboard_ro` role.

| Chart | Type | Source Table | Key Insight |
|---|---|---|---|
| EV Station Density Map | US Choropleth | `fct_ev_density` | Stations per 100k by state |
| Station Count by State | Horizontal Bar | `fct_ev_stations_by_state` | Volume ranking |
| Top 20 Cities | Bar | `fct_ev_stations_by_city` | City-level concentration |
| EV Adoption vs Infrastructure | Scatter Plot | `fct_ev_adoption_vs_infrastructure` | X=ev_count, Y=total_stations, color=gap_score |
| Infrastructure Gap Ranking | Bar | `fct_ev_adoption_vs_infrastructure` | States by evs_per_station descending |
| Port Type Breakdown | Stacked Bar | `fct_ev_stations_by_state` | Level2 vs DC Fast per state |
| KPI Header | Big Number tiles | All marts | Total US stations, total EVs, gap count |

---

## 7. Execution Order

1. Run `sql/snowflake_setup.sql` — create DB, schemas, RAW tables, roles
2. Run `dag_ev_registrations_historical` (once) and `dag_census_population_annual` (once)
3. Enable `dag_nrel_stations_daily` for ongoing daily pulls
4. Run `dbt deps && dbt seed && dbt run && dbt test`
5. Connect Preset.io to Snowflake analytics schema, build charts, assemble dashboard

---

## 8. Verification Queries

```sql
-- After DAG 1: expect ~65,000+ US EV stations
SELECT COUNT(*) FROM raw.ev_stations;

-- After historical load: confirm year coverage
SELECT DISTINCT year FROM raw.ev_registrations ORDER BY year;

-- After dbt run: spot-check the gap analysis
SELECT state, ev_count, total_stations, evs_per_station
FROM analytics.fct_ev_adoption_vs_infrastructure
ORDER BY evs_per_station DESC
LIMIT 10;

-- Density check
SELECT state, stations_per_100k
FROM analytics.fct_ev_density
ORDER BY stations_per_100k DESC;
```

-- ============================================================
-- EV Analytics — Snowflake Setup
-- Run this as ACCOUNTADMIN (the default role for new trial accounts).
-- ============================================================

USE ROLE ACCOUNTADMIN;

-- Database
CREATE DATABASE IF NOT EXISTS EV_ANALYTICS;
USE DATABASE EV_ANALYTICS;

-- Schemas
CREATE SCHEMA IF NOT EXISTS raw;
CREATE SCHEMA IF NOT EXISTS curated;
CREATE SCHEMA IF NOT EXISTS analytics;

-- ============================================================
-- RAW schema — exact replica of source, no transforms
-- ============================================================

USE SCHEMA raw;

-- NREL station data (full snapshot replaced daily)
CREATE TABLE IF NOT EXISTS ev_stations (
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
    ev_connector_types  VARIANT,          -- JSON array from API
    status_code         CHAR(1),          -- E=Open, P=Planned, T=Temp Unavail
    open_date           DATE,
    updated_at          TIMESTAMP,
    _ingested_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- DOE EV registration data by state and year (loaded from seed CSV)
CREATE TABLE IF NOT EXISTS ev_registrations (
    state               CHAR(2),
    state_name          VARCHAR,
    year                INTEGER,
    ev_count            INTEGER,
    vehicle_type        VARCHAR,          -- BEV, PHEV, or ALL
    _ingested_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Census population data by state
CREATE TABLE IF NOT EXISTS census_population (
    state_fips          CHAR(2),
    state_name          VARCHAR,
    year                INTEGER,
    population          INTEGER,
    _ingested_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- ============================================================
-- Read-only role for Preset.io dashboard connection
-- (ACCOUNTADMIN can create roles and grant privileges directly)
-- ============================================================

CREATE ROLE IF NOT EXISTS dashboard_ro;

GRANT USAGE ON DATABASE EV_ANALYTICS TO ROLE dashboard_ro;
GRANT USAGE ON SCHEMA EV_ANALYTICS.analytics TO ROLE dashboard_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA EV_ANALYTICS.analytics TO ROLE dashboard_ro;
GRANT SELECT ON FUTURE TABLES IN SCHEMA EV_ANALYTICS.analytics TO ROLE dashboard_ro;

-- Grant dashboard_ro to your user so you can test with it
GRANT ROLE dashboard_ro TO USER socklord96;

-- ============================================================
-- Verify setup
-- ============================================================

SHOW SCHEMAS IN DATABASE EV_ANALYTICS;
SHOW TABLES IN SCHEMA EV_ANALYTICS.raw;

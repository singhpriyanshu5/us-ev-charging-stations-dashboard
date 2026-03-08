-- Staging: NREL EV stations
-- Cleans, casts, decodes status, and derives the reliable DC fast signal.
--
-- Key data quality handling:
--   ev_dc_fast_num    → 82.2% null; COALESCE to 0 (structural null for L2-only stations)
--   has_dc_fast       → derived from ev_connector_types (99.98% complete); the reliable DC fast signal
--                       captures ~15,703 DC fast stations vs ~10,185 reachable via ev_dc_fast_num alone

SELECT
    station_id,
    station_name,
    UPPER(TRIM(city))   AS city,
    state,
    zip,
    latitude,
    longitude,
    COALESCE(ev_level1_evse_num, 0) AS level1_ports,
    COALESCE(ev_level2_evse_num, 0) AS level2_ports,

    -- ev_dc_fast_num: null for ~82% of stations. 92% of those nulls are genuinely L2-only
    -- (confirmed by cross-tab with ev_connector_types). COALESCE to 0 is correct for the majority.
    -- The remaining ~7.8% real undercount is handled via has_dc_fast below.
    COALESCE(ev_dc_fast_num, 0)     AS dc_fast_ports,

    -- has_dc_fast: derived from ev_connector_types (99.98% complete — only 19 nulls across 85k stations).
    -- This is the authoritative DC fast signal. Use this for station counts and rankings.
    -- dc_fast_ports (above) still undercounts by ~35% of DC fast stations; use with caveat only.
    CASE
        WHEN ARRAY_CONTAINS('CCS'::VARIANT,     ev_connector_types)
          OR ARRAY_CONTAINS('CHADEMO'::VARIANT,  ev_connector_types)
          OR ARRAY_CONTAINS('TESLA'::VARIANT,    ev_connector_types)
          OR ARRAY_CONTAINS('J3400'::VARIANT,    ev_connector_types)
        THEN TRUE ELSE FALSE
    END AS has_dc_fast,

    CASE status_code
        WHEN 'E' THEN 'Open'
        WHEN 'P' THEN 'Planned'
        WHEN 'T' THEN 'Temp Unavailable'
        ELSE 'Unknown'
    END AS status,

    open_date,
    updated_at

FROM {{ source('raw', 'ev_stations') }}
QUALIFY ROW_NUMBER() OVER (PARTITION BY station_id ORDER BY _ingested_at DESC) = 1

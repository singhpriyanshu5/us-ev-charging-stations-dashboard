-- Mart: EV station counts and port totals aggregated at state grain.
--
-- DC fast note: use stations_with_dc_fast (from ev_connector_types, 99.98% complete)
-- for rankings and counts. total_dc_fast_ports_partial undercounts by ~35% of DC fast
-- stations due to ev_dc_fast_num being 82% null at source.

SELECT
    state,
    COUNT(*)                        AS total_stations,
    COUNT_IF(status = 'Open')       AS open_stations,

    -- planned_stations is near-zero in real data (401 US-wide). Kept for completeness.
    COUNT_IF(status = 'Planned')    AS planned_stations,
    COUNT_IF(status = 'Temp Unavailable') AS temp_unavailable_stations,

    SUM(level2_ports)               AS total_level2_ports,

    -- Use this column for DC fast station counts — derived from ev_connector_types (99.98% complete).
    -- Captures all ~15,703 DC fast stations, including 5,518 where ev_dc_fast_num is null.
    COUNT_IF(has_dc_fast)           AS stations_with_dc_fast,

    -- total_dc_fast_ports_partial: from ev_dc_fast_num (82% null in source).
    -- Undercounts by ~35% of true total. Use stations_with_dc_fast above for rankings.
    SUM(dc_fast_ports)              AS total_dc_fast_ports_partial,

    MIN(open_date)                  AS first_station_date

FROM {{ ref('stg_ev_stations') }}
GROUP BY state

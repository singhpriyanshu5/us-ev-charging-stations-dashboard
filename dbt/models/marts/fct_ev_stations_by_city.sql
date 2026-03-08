-- Mart: EV station counts aggregated at state + city grain.
-- Powers the "Top 20 Cities" bar chart on the dashboard.

SELECT
    state,
    city,
    COUNT(*)                        AS total_stations,
    COUNT_IF(status = 'Open')       AS open_stations,
    SUM(level2_ports)               AS total_level2_ports,
    COUNT_IF(has_dc_fast)           AS stations_with_dc_fast,
    SUM(dc_fast_ports)              AS total_dc_fast_ports_partial

FROM {{ ref('stg_ev_stations') }}
GROUP BY state, city

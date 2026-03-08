-- Mart: EV station and adoption metrics aggregated at US Census region grain.
-- Joins station/adoption data with dim_geography to group states by region.
-- Powers the "Regional Breakdown" grouped bar chart on the dashboard.
--
-- Regions (from dim_geography seed):
--   NE = Northeast, SE = Southeast, MW = Midwest, SW = Southwest, W = West

WITH adoption AS (
    SELECT * FROM {{ ref('fct_ev_adoption_vs_infrastructure') }}
),

geo AS (
    SELECT
        state,
        region,
        area_sq_miles
    FROM {{ ref('dim_geography') }}
)

SELECT
    g.region,
    COUNT(*)                                                                            AS state_count,

    -- Station counts
    SUM(a.total_stations)                                                               AS total_stations,
    SUM(a.stations_with_dc_fast)                                                        AS stations_with_dc_fast,
    ROUND(SUM(a.stations_with_dc_fast) / NULLIF(SUM(a.total_stations), 0) * 100, 1)    AS dc_fast_pct,

    -- Population and EV registrations
    SUM(a.population)                                                                   AS total_population,
    SUM(a.ev_count)                                                                     AS total_ev_registrations,

    -- Per-capita density
    ROUND(SUM(a.total_stations) / NULLIF(SUM(a.population), 0) * 100000, 2)            AS stations_per_100k,
    ROUND(SUM(a.ev_count) / NULLIF(SUM(a.population), 0) * 100000, 2)                  AS ev_adoption_rate,

    -- Infrastructure gap (EVs per station — lower = better served)
    ROUND(SUM(a.ev_count) / NULLIF(SUM(a.total_stations), 0), 1)                       AS evs_per_station,

    -- Geographic density (stations per 1,000 sq miles — highway coverage proxy)
    SUM(g.area_sq_miles)                                                                AS total_area_sq_miles,
    ROUND(SUM(a.total_stations) / NULLIF(SUM(g.area_sq_miles), 0) * 1000, 3)           AS stations_per_1000sqmi

FROM adoption a
LEFT JOIN geo g ON a.state = g.state
WHERE g.region IS NOT NULL

GROUP BY g.region
ORDER BY total_stations DESC

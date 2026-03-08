-- Mart: EV station density metrics per state.
-- Joins station counts with Census population to produce per-capita metrics.
-- Powers the choropleth map and density bar charts.
--
-- Population source: Census ACS5 (latest available year, typically 2022).
-- Geography join: state abbreviation → state_fips via dim_geography seed.

WITH stations AS (
    SELECT * FROM {{ ref('fct_ev_stations_by_state') }}
),

population AS (
    SELECT
        p.state_fips,
        p.state_name,
        p.year                          AS population_year,
        p.population,
        g.state                         AS state_abbrev
    FROM {{ ref('stg_census_population') }} p
    LEFT JOIN {{ ref('dim_geography') }} g
        ON p.state_fips = g.state_fips
)

SELECT
    s.state,
    p.state_name,
    p.population,
    p.population_year,
    s.total_stations,
    s.open_stations,
    s.stations_with_dc_fast,
    s.total_level2_ports,

    ROUND(s.total_stations / NULLIF(p.population, 0) * 100000, 2)      AS stations_per_100k,
    ROUND(s.open_stations / NULLIF(p.population, 0) * 100000, 2)       AS open_stations_per_100k,
    ROUND(s.total_level2_ports / NULLIF(p.population, 0) * 100000, 2)  AS level2_ports_per_100k

FROM stations s
LEFT JOIN population p ON s.state = p.state_abbrev

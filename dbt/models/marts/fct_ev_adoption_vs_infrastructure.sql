-- Mart: EV adoption vs charging infrastructure gap analysis.
-- Joins station counts, EV registrations, and population per state.
-- Powers the scatter plot, gap ranking bar chart, and KPI tiles.
--
-- Key metrics:
--   evs_per_station        → infrastructure gap ratio (higher = more underserved)
--   ev_adoption_rate       → EVs per 100k people
--   infrastructure_gap_score → alias of evs_per_station for dashboard labeling

WITH stations AS (
    SELECT * FROM {{ ref('fct_ev_stations_by_state') }}
),

density AS (
    SELECT * FROM {{ ref('fct_ev_density') }}
),

registrations AS (
    -- Use latest year available (2024)
    SELECT * FROM {{ ref('stg_ev_registrations') }}
    WHERE year = 2024
)

SELECT
    s.state,
    d.state_name,
    d.population,
    d.population_year,

    -- Station metrics
    s.total_stations,
    s.open_stations,
    s.stations_with_dc_fast,
    d.stations_per_100k,

    -- EV registration metrics
    r.ev_count,
    r.year                                              AS registration_year,

    -- Gap metrics
    ROUND(r.ev_count / NULLIF(s.total_stations, 0), 1) AS evs_per_station,
    ROUND(r.ev_count / NULLIF(s.total_stations, 0), 1) AS infrastructure_gap_score,

    -- Adoption metrics
    ROUND(r.ev_count / NULLIF(d.population, 0) * 100000, 2) AS ev_adoption_rate

FROM stations s
LEFT JOIN density d          ON s.state = d.state
LEFT JOIN registrations r    ON s.state = r.state

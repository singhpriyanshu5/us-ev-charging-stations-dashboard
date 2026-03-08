-- Staging: US Census ACS5 state population
-- Keeps the latest available year per state. Puerto Rico (fips=72) excluded at DAG level.

SELECT
    state_fips,
    TRIM(state_name)    AS state_name,
    year,
    population

FROM {{ source('raw', 'census_population') }}
QUALIFY ROW_NUMBER() OVER (PARTITION BY state_fips ORDER BY year DESC, _ingested_at DESC) = 1

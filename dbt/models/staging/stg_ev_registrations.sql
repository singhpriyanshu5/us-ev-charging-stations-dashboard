-- Staging: EV registrations by state
-- Source: AFDC page (manual CSV load via Airflow DAG 2). No programmatic API.
-- Keeps only vehicle_type = 'ALL' rows (total BEV + PHEV per state/year).

SELECT
    UPPER(TRIM(state))      AS state,
    TRIM(state_name)        AS state_name,
    year,
    ev_count

FROM {{ source('raw', 'ev_registrations') }}
WHERE UPPER(TRIM(vehicle_type)) = 'ALL'
QUALIFY ROW_NUMBER() OVER (PARTITION BY state, year ORDER BY _ingested_at DESC) = 1

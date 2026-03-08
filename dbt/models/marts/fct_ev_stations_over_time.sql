-- Mart: Annual EV station openings and cumulative totals over time.
-- Powers the "Station Growth Over Time" line chart on the dashboard.
--
-- Filters to stations with a valid open_date (~90% of stations have one).
-- Splits annual and cumulative counts by charger type (DC Fast vs L2-Only)
-- to visualise when DC fast charging became mainstream.
--
-- Note: open_date reflects when the station was first registered in NREL,
-- which is a close proxy for actual opening date.

SELECT
    YEAR(open_date)                                                             AS year,

    -- Annual new station counts
    COUNT(*)                                                                    AS new_stations,
    COUNT_IF(has_dc_fast)                                                       AS new_dc_fast_stations,
    COUNT_IF(NOT has_dc_fast)                                                   AS new_l2_only_stations,

    -- Cumulative totals (window over all prior years)
    SUM(COUNT(*))           OVER (ORDER BY YEAR(open_date) ROWS UNBOUNDED PRECEDING) AS cumulative_stations,
    SUM(COUNT_IF(has_dc_fast))   OVER (ORDER BY YEAR(open_date) ROWS UNBOUNDED PRECEDING) AS cumulative_dc_fast,
    SUM(COUNT_IF(NOT has_dc_fast)) OVER (ORDER BY YEAR(open_date) ROWS UNBOUNDED PRECEDING) AS cumulative_l2_only

FROM {{ ref('stg_ev_stations') }}
WHERE open_date IS NOT NULL
  AND YEAR(open_date) BETWEEN 2000 AND YEAR(CURRENT_DATE())

GROUP BY YEAR(open_date)
ORDER BY year

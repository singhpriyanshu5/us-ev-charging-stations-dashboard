# EV Dashboard — Chart Recommendations

**Date**: 2026-03-08
**Status**: Implemented in mock dashboard; dbt models added; Preset config instructions below.

---

## Overview of Current Dashboard (7 charts)

| # | Chart | Type | Dataset |
|---|---|---|---|
| 1 | EV Station Density by State | Choropleth | `fct_ev_density` |
| 2 | Top 15 States by EV Stations | Bar | `fct_ev_stations_by_state` |
| 3 | DC Fast vs L2-Only Stations (Top 10 States) | Stacked Bar | `fct_ev_stations_by_state` |
| 4 | EV Adoption vs Infrastructure by State | Bubble Chart | `fct_ev_adoption_vs_infrastructure` |
| 5 | Infrastructure Gap Ranking by State | Bar | `fct_ev_adoption_vs_infrastructure` |
| 6 | Top 20 Cities by EV Stations | Bar | `fct_ev_stations_by_city` |
| KPI | Total Stations / Total Registrations / Avg Gap Score | Big Number | Various |

---

## Recommended Charts (5 additions)

---

### 1. Station Growth Over Time — Stacked Area Line Chart

**Why it's valuable**: The single most compelling narrative chart missing from the dashboard. Shows the year-by-year acceleration of EV charging rollout from ~200 stations in 2005 to 85k+ today, and separately tracks when DC fast charging went mainstream (post-2018 inflection). Essential for understanding infrastructure momentum.

**Chart type**: Stacked Area / Multi-line
**X-axis**: Year (`year`)
**Y-axis**: Cumulative station count
**Series**: `cumulative_dc_fast` (amber), `cumulative_l2_only` (blue)

**New dbt model required**: `fct_ev_stations_over_time`
**File**: `dbt/models/marts/fct_ev_stations_over_time.sql`

**Preset implementation**:
1. After running `dbt run`, add dataset `fct_ev_stations_over_time` in Preset (same `analytics` schema)
2. Create chart → type: **Line Chart** (not time-series; use `year` as X dimension)
3. Add two metrics: `SUM(cumulative_dc_fast)` and `SUM(cumulative_l2_only)`, or use a single `SUM(cumulative_stations)` for a simpler single-line view
4. Sort by `year` ascending

**Variant**: Use `new_stations` on Y-axis (annual additions bar chart) instead of cumulative, to emphasise boom years.

---

### 2. DC Fast Penetration Rate by State — Horizontal Bar Chart

**Why it's valuable**: The existing "DC Fast vs L2-Only" chart shows *absolute counts* — California dominates because it has the most stations. This chart shows the *proportion*: what share of each state's stations have fast-charging capability. States can have many stations but mostly slow L2 (a problem for inter-city EV drivers). Reveals fast-charging maturity independent of total volume.

**Chart type**: Horizontal Bar
**Metric**: `stations_with_dc_fast / total_stations * 100` (custom SQL)
**Sort**: Descending by DC fast %

**Dataset**: `fct_ev_stations_by_state` (no new model needed)

**Preset implementation**:
1. Open dataset `fct_ev_stations_by_state`
2. Create chart → type: **Bar Chart**
3. Dimension: `state`; Metric: Custom SQL → `SUM(STATIONS_WITH_DC_FAST) / SUM(TOTAL_STATIONS) * 100`
4. Label as "DC Fast %"; sort descending; limit to top 20 states

---

### 3. L2 Charging Port Density by State — Choropleth Map

**Why it's valuable**: The existing density map uses *stations per 100k* — but a station can have 1 port or 20 ports. Port density (L2 ports per 100k people) measures actual charging *capacity*, not just the number of access points. A second map using `level2_ports_per_100k` reveals very different geographic patterns — states with large multi-port charging hubs (like shopping-centre deployments) stand out.

**Chart type**: Choropleth (USA Map)
**Metric**: `level2_ports_per_100k` (already computed in `fct_ev_density`)
**Color scale**: Purples (to distinguish visually from the existing blue density map)

**Dataset**: `fct_ev_density` (no new model needed — column already exists)

**Preset implementation**:
1. Add a second chart using the existing `fct_ev_density` dataset
2. Create chart → type: **USA Map**
3. ISO 3166-2 column: Custom SQL → `CONCAT('US-', STATE)`
4. Metric: `AVG(LEVEL2_PORTS_PER_100K)`
5. Color scale: choose a contrasting palette (e.g. Purples)

---

### 4. Station Open Rate by State — Horizontal Bar Chart

**Why it's valuable**: All other charts measure *quantity* — this is the only **quality/reliability** metric. `open_stations / total_stations * 100` shows what percentage of stations are currently operational. States with low open rates (many "Temp Unavailable" stations) signal reliability problems, poor maintenance, or stale NREL data. A national average below ~90% is a red flag worth surfacing.

**Chart type**: Horizontal Bar
**Metric**: `open_stations / total_stations * 100` (custom SQL)
**Sort**: Ascending (worst states first)
**Color**: Red–Yellow–Green diverging scale (green = reliable)

**Dataset**: `fct_ev_stations_by_state` (no new model needed)

**Preset implementation**:
1. Open dataset `fct_ev_stations_by_state`
2. Create chart → type: **Bar Chart**
3. Dimension: `state`; Metric: Custom SQL → `SUM(OPEN_STATIONS) / SUM(TOTAL_STATIONS) * 100`
4. Sort ascending (worst first); limit to bottom 20 or all 52 states
5. Add a reference line at 95% to mark a "healthy" threshold

---

### 5. Regional Breakdown — Grouped Bar Chart

**Why it's valuable**: State-level charts make it hard to see macro geographic patterns. Grouping into 5 US regions (Northeast, Southeast, Midwest, Southwest, West) reveals the West's dominance in both station count *and* EV adoption, versus the Southeast lagging on both dimensions. The regional `evs_per_station` gap score shows where policy investment is most needed at a macro level.

**Chart type**: Bar (two charts side by side: total stations + avg gap score)
**Dimension**: `region`
**Metrics**: `total_stations`, `evs_per_station`, `stations_per_100k`, `ev_adoption_rate`

**New dbt model required**: `fct_ev_stations_by_region`
**File**: `dbt/models/marts/fct_ev_stations_by_region.sql`

**Preset implementation**:
1. After running `dbt run`, add dataset `fct_ev_stations_by_region` in Preset
2. Chart A → Bar: X = `region`, Y = `SUM(total_stations)`, color-coded by region
3. Chart B → Bar: X = `region`, Y = `AVG(evs_per_station)`, color = diverging red scale (higher = worse)
4. Optionally: single grouped bar with multiple metrics using a stacked/grouped layout

---

## Implementation Summary

| # | Chart | New dbt Model | Dataset | Effort |
|---|---|---|---|---|
| 1 | Station Growth Over Time | `fct_ev_stations_over_time` ✅ | New | Medium |
| 2 | DC Fast Penetration % by State | None | `fct_ev_stations_by_state` | Low |
| 3 | L2 Port Density Map | None | `fct_ev_density` | Low |
| 4 | Station Open Rate by State | None | `fct_ev_stations_by_state` | Low |
| 5 | Regional Breakdown | `fct_ev_stations_by_region` ✅ | New | Medium |

**Charts 2, 3, 4** can be added in Preset immediately — all data already exists in current marts.
**Charts 1 and 5** require running `dbt run` first to materialise the two new mart tables.

---

## dbt Run Command

After adding the two new model files, run from the `dbt/` directory:

```bash
dbt run --select fct_ev_stations_over_time fct_ev_stations_by_region
dbt test --select fct_ev_stations_over_time fct_ev_stations_by_region
```

Then add both tables as datasets in Preset using the existing `analytics` schema connection.

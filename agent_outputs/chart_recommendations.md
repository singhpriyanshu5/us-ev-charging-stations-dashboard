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

### 3. L2 Ports per Station by State — Horizontal Bar Chart

**Why it's valuable**: Both the existing density map and a ports-per-100k map answer the same geographic question — "which states have more infrastructure?" This chart asks a different question: *how concentrated is that infrastructure?* A high `l2_ports_per_station` ratio means a state's charging network is built around large multi-port hubs (e.g. shopping-centre deployments), while a low ratio means mostly single-port kerbside chargers. This reveals network *design patterns*, not just volume, and flags states where adding ports at existing stations would be more efficient than building new ones.

**Chart type**: Horizontal Bar (all states, sorted ascending)
**Metric**: `total_level2_ports / total_stations` (custom SQL)
**Color scale**: Blues

**Dataset**: `fct_ev_stations_by_state` (no new model needed)

**Preset implementation**:
1. Open dataset `fct_ev_stations_by_state`
2. Create chart → type: **Bar Chart**
3. Dimension: `state`; Metric: Custom SQL → `SUM(TOTAL_LEVEL2_PORTS) / SUM(TOTAL_STATIONS)`
4. Label as "L2 Ports per Station"; sort ascending
5. Show all states for full picture, or filter to top/bottom 20 for focused view

---

### 4. Station Open Rate by State — ~~Horizontal Bar Chart~~ DROPPED

**Original intent**: Surface states with low open rates as a reliability signal.

**Why dropped**: Built and evaluated against real NREL data — all 52 states/territories show ~98% open rate with less than 0.1% spread between the best and worst states. No meaningful variation exists to visualise. Likely causes: NREL "Temporarily Unavailable" status is inconsistently updated by operators, and state-level aggregation washes out individual station reliability issues. Chart was not added to the Preset dashboard.

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
| 3 | L2 Ports per Station by State | None | `fct_ev_stations_by_state` | Low |
| 4 | ~~Station Open Rate by State~~ | None | `fct_ev_stations_by_state` | Dropped — no variation in real data (~98% across all states) |
| 5 | Regional Breakdown | `fct_ev_stations_by_region` ✅ | New | Medium |

**Charts 2 and 3** can be added in Preset immediately — all data already exists in current marts.
**Charts 1 and 5** required running `dbt run` first to materialise the two new mart tables.
**Chart 4** was dropped after evaluation — see above.

---

## dbt Run Command

After adding the two new model files, run from the `dbt/` directory:

```bash
dbt run --select fct_ev_stations_over_time fct_ev_stations_by_region
dbt test --select fct_ev_stations_over_time fct_ev_stations_by_region
```

Then add both tables as datasets in Preset using the existing `analytics` schema connection.

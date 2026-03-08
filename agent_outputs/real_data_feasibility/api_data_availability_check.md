# Real Data Feasibility Check — EV Charging Dashboard

**Date:** 2026-03-07
**Purpose:** Verify whether each data column in `mock_dashboard/mock_data.py` can be sourced from
the real APIs defined in `PLAN.md` and `project_proposal.md`. Actual live API calls were made to each source.

---

## APIs Tested

| Source | Endpoint | Auth | Status |
|--------|----------|------|--------|
| NREL Alt Fuel Stations | `https://developer.nrel.gov/api/alt-fuel-stations/v1.json` | Free API key (tested with DEMO_KEY) | ✅ Live |
| NREL Last-Updated | `/v1/last-updated.json` | Same key | ✅ Live |
| US Census ACS5 | `https://api.census.gov/data/2022/acs/acs5?get=NAME,B01003_001E&for=state:*` | None required | ✅ Live |
| AFDC EV Registrations | `https://afdc.energy.gov/vehicle-registration` | None | ✅ Data visible, no programmatic API |
| Atlas EV Hub | `https://www.atlasevhub.com/materials/state-ev-registration-data/` | None | ⚠️ Partial (11 states only) |

---

## NREL API — Full Dataset Stats (live pull, 2026-03-07)

- **Total US EV stations returned:** 85,664
- **States covered:** All 50 + DC + PR (52 total)
- **Last updated:** 2026-03-08T02:01:52Z (confirmed via last-updated endpoint)

### Top 25 States by Station Count (real data vs mock data)

| State | Real Stations | Mock Stations | Real Open | Real Planned | Real L2 Ports | Real DCF Ports |
|-------|--------------|---------------|-----------|--------------|---------------|----------------|
| CA    | 20,597       | ~15,000       | 20,206    | 76           | 56,616        | 18,449         |
| NY    | 5,572        | ~4,800        | 5,389     | 35           | 17,905        | 3,145          |
| FL    | 4,629        | ~4,200        | 4,519     | 11           | 10,961        | 4,699          |
| MA    | 4,465        | ~2,200        | 4,389     | 7            | 9,931         | 1,762          |
| TX    | 4,099        | ~3,800        | 3,970     | 36           | 8,447         | 4,767          |
| WA    | 3,105        | ~2,800        | 3,045     | 11           | 6,879         | 2,023          |
| CO    | 2,891        | ~2,500        | 2,840     | 12           | 6,472         | 1,602          |
| GA    | 2,466        | ~1,200        | 2,416     | 7            | 6,150         | 2,084          |
| MI    | 2,136        | ~820          | 2,086     | 13           | 4,340         | 1,613          |
| PA    | 2,134        | ~1,350        | 2,077     | 19           | 4,281         | 1,836          |
| OH    | 2,104        | ~780          | 2,029     | 24           | 4,308         | 1,468          |
| VA    | 2,056        | ~1,500        | 1,981     | 38           | 4,642         | 1,735          |
| NC    | 2,044        | ~1,050        | 1,998     | 8            | 4,457         | 1,791          |
| NJ    | 1,910        | ~1,600        | 1,848     | 17           | 4,562         | 2,039          |
| IL    | 1,860        | ~1,800        | 1,827     | 2            | 3,579         | 2,499          |

**US Totals (real):** 85,664 stations | 83,669 open | 401 planned | 202,021 L2 ports | 71,774 DCF ports

---

## Column-by-Column Feasibility (mock_data.py → real API)

### `get_state_data()` columns

| Column | Mock Logic | Real Source | Feasibility | Notes |
|--------|-----------|-------------|-------------|-------|
| `state` | Static list of 50 abbrevs | NREL field `state` | ✅ Full | All 50 states present |
| `state_name` | Static lookup | Census field `NAME` or static dim | ✅ Full | Census returns full name |
| `region` | Static lookup (NE/SE/MW/W/SW) | No API — static dim table | ✅ Full | Hardcode in `dim_geography.sql` |
| `population` | Static hardcoded dict | Census ACS5 `B01003_001E` | ✅ Full | 52 rows returned (all states + DC + PR) |
| `total_stations` | BASE_STATIONS dict × noise | NREL `COUNT(*)` GROUP BY state | ✅ Full | 85,664 total; real ordering matches mock (CA >> NY > FL > TX > WA) |
| `open_stations` | 85–95% of total_stations | NREL `status_code = 'E'` | ✅ Full | 83,669 open (~97.7% open rate; higher than mock's 85-95%) |
| `planned_stations` | 5–15% of total_stations | NREL `status_code = 'P'` | ⚠️ Very Sparse | Only **401 total planned** US-wide (0.5% of stations). Mock overestimates by 10-30x. Data exists but is nearly absent. |
| `total_level2_ports` | `total_stations × random(2.5–4.0)` | NREL `SUM(ev_level2_evse_num)` | ⚠️ Partial | **16.5% null** across all stations. Treating null as 0 gives a minor undercount — acceptable for most use cases. |
| `total_dc_fast_ports` | `total_stations × random(0.3–0.8)` | NREL `SUM(ev_dc_fast_num)` | ❌ Unreliable | **82.2% null** — severe systematic gap. Pattern: 81.7% of stations report L2 but NOT DCF. Only 1.9% of stations have both. Summing non-null values gives a severe undercount. |
| `total_ports` | L2 + DCF | Derived | ❌ Unreliable | Dependent on DCF accuracy. |
| `ev_registrations` | Population × adoption factor | AFDC/DOE vehicle registration page | ⚠️ Manual Download | Data exists and is current (2024 total: 4,503,700 EVs; CA: 1,533,900; TX: 294,700; FL: 334,800). No programmatic CSV API. Must be manually downloaded from afdc.energy.gov/vehicle-registration. |
| `stations_per_100k` | `total_stations / pop × 100k` | Derived (NREL + Census) | ✅ Derivable | Both numerator and denominator available |
| `evs_per_station` | `ev_registrations / total_stations` | Derived (AFDC + NREL) | ✅ Derivable | Once EV registrations obtained |
| `ev_adoption_rate` | `ev_registrations / pop × 100k` | Derived (AFDC + Census) | ✅ Derivable | Once EV registrations obtained |

### `get_city_data()` columns

| Column | Mock Logic | Real Source | Feasibility | Notes |
|--------|-----------|-------------|-------------|-------|
| `city` | Hardcoded list of 25 cities | NREL field `city` | ✅ Full | GROUP BY city, state gives counts for every city |
| `state` | Hardcoded | NREL field `state` | ✅ Full | |
| `total_stations` | Hardcoded + noise | NREL `COUNT(*)` GROUP BY city, state | ✅ Full | Can rank any top-N cities |
| `level2_ports` | Hardcoded + noise | NREL `SUM(ev_level2_evse_num)` | ⚠️ Partial | Same 16.5% null as state-level |
| `dc_fast_ports` | Hardcoded + noise | NREL `SUM(ev_dc_fast_num)` | ❌ Unreliable | Same 82.2% null as state-level |

---

## Critical Findings

### 1. DC Fast Port counts are systematically under-reported (BLOCKER for port mix chart)

The `ev_dc_fast_num` field is null for **82.2% of all 85,664 stations**. This is not random missing data — it's a systematic pattern: stations report Level 2 EVSE count OR DC Fast count, rarely both.

```
Null pattern across 85,664 stations:
  Both L2 + DCF present:      1,602  (1.9%)
  Only L2 reported, no DCF:  69,945 (81.7%)
  Both null:                    510  (0.6%)
```

**Impact:** The "Port Mix: Level 2 vs DC Fast" stacked bar chart (Row 2, right panel in mock dashboard)
cannot be reproduced accurately with real data. Summing non-null DCF values would show 71,774 ports
but the true count is unknown.

**Workaround options:**
- Use station count as a proxy for DC fast presence (stations where `ev_dc_fast_num IS NOT NULL`)
- Supplement with DOE's AFDC bulk download which may include a more complete field
- Display L2 ports only and drop the stacked comparison
- Show "% of stations with DC fast charger" as a binary flag rather than port count

### 2. Planned station count is near-zero in real data

Mock data simulates 5-15% of total stations as "planned." Real NREL data shows only 401 planned
stations across the entire US (0.5% of total). The `planned_stations` column will exist in the
real data but will be negligible and cannot meaningfully be surfaced as a KPI.

### 3. EV registration data has no programmatic API

The AFDC page (`afdc.energy.gov/vehicle-registration`) shows complete 2024 state-level EV
registration counts (sourced from Experian), but there is no:
- Direct CSV download URL
- REST API endpoint
- Programmatic access

The NREL developer portal does not offer an EV registrations API. Atlas EV Hub has CSVs for
only 11 states at zip/county level.

**Required action:** The `dag_ev_registrations_historical.py` DAG cannot use a URL-based download.
Instead, the AFDC registration data must be:
1. Manually downloaded from the AFDC website as a copy-paste or screen-scraped table
2. OR sourced from the Kaggle `ev-registration-counts-by-state` dataset (mirrors AFDC data)
3. OR hard-coded for the most recent year (2024) since the WebFetch confirmed these values:
   CA: 1,533,900 | TX: 294,700 | FL: 334,800 | NY: 168,100 | WA: 191,400 | US Total: 4,503,700

---

## What Can Be Built with Real Data (No Changes)

The following dashboard charts work directly with real API data:

| Chart | Status |
|-------|--------|
| US Choropleth — stations per 100k | ✅ Ready (NREL + Census) |
| Top 15 States by Total Stations | ✅ Ready (NREL) |
| EV Adoption vs Station Density Scatter | ✅ Ready (once EV regs loaded manually) |
| Infrastructure Gap Ranking (EVs per station) | ✅ Ready (once EV regs loaded manually) |
| Top 20 Cities by Station Count | ✅ Ready (NREL, city-level aggregation) |
| KPI: Total EV Stations | ✅ Ready (NREL COUNT) |
| KPI: Total EV Registrations | ✅ Ready (AFDC manual load) |
| KPI: Avg Stations per 100k | ✅ Ready (derived) |
| KPI: States with Gap Score > 50 | ✅ Ready (derived) |

The following require adjustments:

| Chart | Issue | Recommended Change |
|-------|-------|-------------------|
| Port Mix: Level 2 vs DC Fast | DCF 82% null | Replace with "% stations with DC fast" binary or drop DCF bar |
| `planned_stations` KPI or chart | Near-zero in real data (401 total) | Drop this metric or replace with "temp unavailable" count |

---

## Recommended Next Steps

1. **Get a real NREL API key** — DEMO_KEY works but is rate-limited. Free key at developer.nrel.gov.

2. **Load EV registration data manually** — Visit afdc.energy.gov/vehicle-registration, copy the 2024
   state table, and save as `data/ev_registrations_2024.csv`. This becomes the one-time seed file
   for the `dag_ev_registrations_historical` DAG.

3. **Revise the port mix chart** — Change the stacked bar (Row 2 right panel) to show:
   - Number of stations with at least one DC fast charger (`ev_dc_fast_num IS NOT NULL`)
   - vs stations with only Level 2
   This gives a clean binary view without relying on null-heavy port counts.

4. **Drop `planned_stations`** — Real data shows only 401 planned stations US-wide. Remove from
   KPIs and dbt models, or replace with `temp_unavailable_stations` (1,595 stations with status='T').

5. **Census ACS5 year alignment** — Use 2022 ACS5 (latest available as of this check). The 2023
   data may not yet be published in the 5-year estimates. Confirm with:
   `curl https://api.census.gov/data.json | jq '.dataset[] | select(.title | contains("ACS 5"))'`

---

## Census Population — Live Data Check

```
Total state rows returned: 52 (50 states + DC + Puerto Rico)
Sample (top 5 by population):
  California      39,356,104  fips=06
  Texas           29,243,342  fips=48
  Florida         21,634,529  fips=12
  New York        19,994,379  fips=36
  Pennsylvania    12,989,208  fips=42
US total (sum of all 52 rows): 334,369,975
```

Population figures are consistent with real-world 2022 values. No data gaps.

---

## Summary Verdict

| Data Column Group | Verdict |
|-------------------|---------|
| Station counts (total, open) by state and city | ✅ Fully available from NREL |
| Port counts — Level 2 | ✅ Mostly available (16.5% null, treat as 0) |
| Port counts — DC Fast | ❌ Not reliable (82.2% null) — chart must change |
| Planned stations | ⚠️ Exists but near-zero — metric not meaningful |
| Population | ✅ Fully available from Census ACS5 |
| EV registrations | ⚠️ Data exists but no API — requires manual one-time load |
| Derived metrics (stations/100k, evs/station, adoption rate) | ✅ All derivable once above sources loaded |
| Region / state name | ✅ Static dim table |

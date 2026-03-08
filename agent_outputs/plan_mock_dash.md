# Mock Dashboard Plan — EV Charging Infrastructure Analytics

## Context

Before building the real Preset.io dashboard connected to Snowflake, this plan creates a local
interactive mock dashboard using fake but realistic data. The goal is to validate the layout,
chart types, and key metrics defined in `PLAN.md` before investing in the full pipeline.

---

## Approach: Streamlit + Plotly

**Tool choice: Streamlit + Plotly**

Streamlit produces a true multi-panel dashboard layout that closely mirrors what Preset.io will
look like. Plotly supports all the required chart types (choropleth, scatter, stacked bar) and
its interactivity (hover tooltips, zoom) mirrors Preset.io behavior. pandas and numpy are already
installed; only `streamlit` and `plotly` need to be added.

Jupyter notebooks were considered but ruled out — charts render vertically in cells, not in
side-by-side panels, so they don't represent the actual dashboard layout.

---

## Files to Create

```
ev-charging-stations-dashboard/
├── mock_dashboard/
│   ├── mock_data.py        # generates all fake state + city DataFrames
│   └── app.py              # Streamlit dashboard app
└── agent_outputs/
    └── plan_mock_dash.md   # this file
```

---

## Mock Data Design (`mock_data.py`)

All data is generated with `numpy.random.seed(42)` for reproducibility.

### `get_state_data()` → DataFrame (50 rows, one per US state)

| Column | Value Range / Logic |
|---|---|
| `state` | All 50 state abbreviations |
| `state_name` | Full state names |
| `region` | NE / SE / MW / W / SW |
| `population` | 500k–40M (approximated from 2023 Census) |
| `total_stations` | 50–15,000 (CA highest ~15k, WY lowest ~50) |
| `open_stations` | 85–95% of `total_stations` |
| `planned_stations` | 5–15% of `total_stations` |
| `total_level2_ports` | `total_stations` × random(2.5–4.0) |
| `total_dc_fast_ports` | `total_stations` × random(0.3–0.8) |
| `total_ports` | `total_level2_ports` + `total_dc_fast_ports` |
| `ev_registrations` | Correlated with population + urban density factor |
| `stations_per_100k` | `total_stations / population × 100,000` |
| `evs_per_station` | `ev_registrations / total_stations` — infrastructure gap ratio |
| `ev_adoption_rate` | `ev_registrations / population × 100,000` |

**Rough real-world ordering preserved:**
- Stations: CA >> NY > FL > TX > WA > CO > MA
- EV registrations: CA >> FL > TX > WA > NY
- Gap score (underserved): TX, FL, GA near top; VT, CO, WA near bottom

### `get_city_data()` → DataFrame (~25 rows, major US cities)

| Column | Description |
|---|---|
| `city` | City name |
| `state` | State abbreviation |
| `total_stations` | Station count for that city |
| `level2_ports` | Level 2 EVSE port count |
| `dc_fast_ports` | DC fast charger port count |

Cities included: Los Angeles, San Francisco, San Diego, New York, Seattle, Portland,
Denver, Chicago, Austin, Houston, Boston, Phoenix, Atlanta, Miami, Las Vegas, Nashville,
Portland, Minneapolis, San Jose, Sacramento, and others.

---

## Dashboard Layout (`app.py`)

### Header
- Title: **"EV Charging Infrastructure & Adoption Dashboard"**
- Subtitle caption: *"Note: All data is simulated for layout preview purposes."*

### Row 0 — KPI Tiles (4 columns)
| Tile | Metric |
|---|---|
| Total EV Stations (US) | `sum(total_stations)` |
| Total EV Registrations | `sum(ev_registrations)` |
| Avg Stations per 100k | `mean(stations_per_100k)` |
| States with Gap Score > 50 | `count(evs_per_station > 50)` |

### Row 1 — Full Width
- **US Choropleth Map** — states colored by `stations_per_100k`
  - Color scale: `Blues`
  - Hover: state name, total stations, stations per 100k
  - Scope: `usa`, `locationmode='USA-states'`

### Row 2 — Two Columns
- **Left (60%)**: Horizontal Bar — Top 15 states by `total_stations`, sorted descending
- **Right (40%)**: Stacked Bar — `total_level2_ports` vs `total_dc_fast_ports` for top 10 states

### Row 3 — Two Columns
- **Left (50%)**: Scatter Plot
  - X = `ev_adoption_rate` (EVs per 100k people)
  - Y = `stations_per_100k`
  - Bubble size = `total_stations`
  - Color = `evs_per_station` (gap score), scale: `RdYlGn_r` (red=underserved)
  - Hover: state name + all four metrics
- **Right (50%)**: Infrastructure Gap Ranking — horizontal bar, top 15 states by
  `evs_per_station` descending, red bars, annotated with values

### Row 4 — Full Width
- **Top 20 Cities Bar Chart** — `total_stations` per city, colored by state

---

## How to Interpret Each Chart (in context of real Preset.io dashboard)

| Chart | What to look for |
|---|---|
| Choropleth | Dark blue states = well-served (VT, CO, WA). Light = underserved. |
| Station Count Bar | Confirms CA dominance; useful for volume comparisons |
| Stacked Bar | Ratio of DC Fast vs Level 2 — higher DC fast = better for road-trip coverage |
| Scatter Plot | States in top-right quadrant = high adoption + good infrastructure (ideal). Bottom-right = high adoption + low infra (problem states) |
| Gap Ranking | States at top need the most new stations relative to their EV population |
| City Bar | Shows where stations cluster — useful for city-level policy decisions |

---

## Run Instructions

```bash
cd ev-charging-stations-dashboard/mock_dashboard
pip install streamlit plotly pandas
streamlit run app.py
```

Dashboard opens at `http://localhost:8501` in your browser.

---

## Verification Checklist

- [ ] All 50 states appear on choropleth with varying color intensity
- [ ] KPI tiles show non-zero, realistic aggregate numbers
- [ ] Scatter plot shows visible pattern (high adoption ↔ high infra correlation)
- [ ] Gap ranking is dominated by large-population states (TX, FL, GA)
- [ ] Top 20 cities bar is dominated by CA cities + Seattle, NYC, Chicago
- [ ] No import errors on `streamlit run app.py`

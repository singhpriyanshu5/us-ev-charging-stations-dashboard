# Implementation Summary: Web-Based Dashboard Frontend (v2)

**Date**: 2026-03-13
**Goal**: Replace the Preset.io (Superset) dashboard with a standalone static web frontend that can be hosted and shared as a URL.

---

## Architecture

```
Snowflake (EV_ANALYTICS.analytics)
        ↓  python export_data.py (runs locally)
JSON files (~65KB total)
        ↓  git push
GitHub Pages (static site from /docs)
        ↓
Shareable URL
```

**Key design decisions:**
- **Static site** — no backend server at runtime; all data pre-exported as JSON
- **Plotly.js** — same charting library as the mock Streamlit dashboard (1:1 translation from Python)
- **No credentials exposed** — Snowflake env vars only used locally during export
- **GitHub Pages** — free hosting, auto-deploys on push to `/docs` folder

---

## Files Created

```
web_dashboard/
├── export_data.py              # Snowflake → JSON exporter (Python)
├── index.html                  # Single-page dashboard layout
├── css/
│   └── dashboard.css           # Grid layout, KPI cards, responsive styling
├── js/
│   └── dashboard.js            # 12 Plotly.js chart render functions
└── data/                       # Exported JSON (git-tracked)
    ├── kpis.json                   (97B)
    ├── stations_by_state.json      (15KB, 52 rows)
    ├── stations_by_city.json       (5.1KB, 25 rows)
    ├── ev_density.json             (17KB, 52 rows)
    ├── adoption_vs_infrastructure.json (20KB, 52 rows)
    ├── stations_by_region.json     (1.8KB, 5 rows)
    └── stations_over_time.json     (5.2KB, 25 rows)

docs/                           # GitHub Pages deployment copy
├── index.html
├── css/dashboard.css
├── js/dashboard.js
└── data/*.json
```

---

## Data Export (`export_data.py`)

- Connects to Snowflake using existing `.env` variables (`SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_ROLE`)
- Queries 6 analytics fact tables:

| Query | Source Table | Rows |
|-------|-------------|------|
| `stations_by_state` | `fct_ev_stations_by_state` | 52 |
| `stations_by_city` | `fct_ev_stations_by_city` (top 25) | 25 |
| `ev_density` | `fct_ev_density` | 52 |
| `adoption_vs_infrastructure` | `fct_ev_adoption_vs_infrastructure` | 52 |
| `stations_by_region` | `fct_ev_stations_by_region` | 5 |
| `stations_over_time` | `fct_ev_stations_over_time` | 25 |

- Computes 3 KPI values from `adoption_vs_infrastructure`: total stations (85,771), total EV registrations (4,506,800), avg EVs per station (52.5)
- Handles Snowflake `Decimal` and `datetime` types during serialization
- Null-safe KPI aggregation (Puerto Rico has no population/registration data)

---

## Dashboard Layout (`index.html`)

Single-page HTML with 4 sections:

1. **KPI Tiles** — 3 cards: Total Stations, Total EV Registrations, Avg EVs per Station
2. **Overview** — Choropleth map, Top 15 States bar, DC Fast vs L2 stacked bar, Top 20 Cities bar, Station Growth area chart
3. **EV Adoption & Infrastructure Metrics** — Adoption scatter plot, Gap Ranking bar, DC Fast Penetration bar, L2 Ports per Station bar
4. **Regional Breakdowns** — Regional Station Count bar, Regional EVs per Station bar

**CDN dependencies:**
- Plotly.js 2.32.0 (charting)
- Google Fonts — Inter (typography)

---

## Chart Specifications (`dashboard.js`)

| # | Function | Chart Type | Data Source | Color Scheme |
|---|----------|-----------|-------------|-------------|
| 1 | `renderKPIs` | KPI tiles | `kpis.json` | — |
| 2 | `renderChoropleth` | USA state map | `ev_density.json` | Light teal gradient |
| 3 | `renderTop15States` | Horizontal bar | `stations_by_state.json` | Blues gradient |
| 4 | `renderDCFastVsL2` | Stacked horizontal bar | `stations_by_state.json` | Blue + Amber |
| 5 | `renderTop20Cities` | Vertical bar | `stations_by_city.json` | Blues gradient |
| 6 | `renderGrowthOverTime` | Stacked area | `stations_over_time.json` | Blue + Amber fills |
| 7 | `renderAdoptionScatter` | Bubble scatter | `adoption_vs_infrastructure.json` | RdYlGn diverging |
| 8 | `renderGapRanking` | Horizontal bar | `adoption_vs_infrastructure.json` | Pink-to-red gradient |
| 9 | `renderDCFastPenetration` | Horizontal bar | `stations_by_state.json` | Amber/orange gradient |
| 10 | `renderL2PortsPerStation` | Horizontal bar | `stations_by_state.json` | Blues gradient |
| 11 | `renderRegionalStations` | Vertical bar | `stations_by_region.json` | 5 distinct colors |
| 12 | `renderRegionalGap` | Vertical bar | `stations_by_region.json` | Orange-to-red gradient |

**Init flow:** `Promise.all` loads all 7 JSON files in parallel → filters out null records (Puerto Rico) → calls all 12 render functions.

---

## Styling (`dashboard.css`)

- **Font**: Inter (Google Fonts), fallback to system sans-serif
- **Background**: Light gray (`#f0f2f5`)
- **Header**: Dark navy (`#1a1a2e`) with white text
- **KPI Cards**: White, subtle shadow, 2.4rem bold numbers, uppercase gray labels
- **Chart Cards**: White, 12px border-radius, `0 1px 3px` box-shadow
- **Layout**: CSS Grid — 2-column for side-by-side charts, full-width for map/cities/growth
- **Responsive**: Stacks to single column below 768px

---

## Deployment

- **PR**: [#3](https://github.com/singhpriyanshu5/us-ev-charging-stations-dashboard/pull/3) on `web-dashboard` branch
- **GitHub Pages**: Serves from `/docs` folder on `main` branch
- **URL**: `https://singhpriyanshu5.github.io/us-ev-charging-stations-dashboard/`

**To enable:** Repo Settings → Pages → Source: Deploy from branch → Branch: `main` / `/docs` → Save

---

## Local Testing

```bash
# Navigate to the web dashboard directory
cd ev-charging-stations-dashboard/web_dashboard

# Start a local HTTP server (required — fetch() won't work from file://)
python -m http.server 8000

# Open in browser
open http://localhost:8000
```

- All 12 charts should render with real Snowflake data
- KPI tiles should show: 85.7k stations, 4.51M registrations, 52.5 gap score
- Compare against the Preset.io screenshot at `EV_Charging_Infrastructure_Adoption_Dashboard_v2_image.png`
- Test responsive layout by resizing the browser window below 768px width
- To stop the server: `Ctrl+C`

---

## Refreshing Data (JSON files)

When upstream data changes (new NREL stations, updated registrations, fresh Census data), refresh the dashboard JSON files:

```bash
# 0. Ensure .env is populated with Snowflake credentials
#    Required vars: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD,
#                   SNOWFLAKE_DATABASE, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_ROLE

# 1. Run dbt to refresh the analytics tables in Snowflake
cd ev-charging-stations-dashboard/dbt
dbt run --target prod

# 2. Export fresh data from Snowflake to JSON
cd ../web_dashboard
python export_data.py
#    This writes 7 files to web_dashboard/data/:
#      kpis.json, stations_by_state.json, stations_by_city.json,
#      ev_density.json, adoption_vs_infrastructure.json,
#      stations_by_region.json, stations_over_time.json

# 3. (Optional) Verify locally before deploying
python -m http.server 8000
# Open http://localhost:8000 and confirm charts look correct, then Ctrl+C

# 4. Copy updated files to the docs/ deployment folder
cp index.html ../docs/
cp -r css js data ../docs/

# 5. Commit and push (GitHub Pages auto-deploys)
cd ..
git add docs/data/ web_dashboard/data/
git commit -m "refresh dashboard data"
git push
```

**Dependencies for export_data.py:**
- `snowflake-connector-python` (already installed from Airflow requirements)
- `python-dotenv` (`pip install python-dotenv`)

---

## Relationship to Existing Components

| Component | Role | Changed? |
|-----------|------|----------|
| Airflow DAGs | Ingest data to Snowflake | No |
| dbt models | Transform raw → analytics | No |
| Snowflake analytics tables | Source of truth | No |
| Preset.io dashboard (v1) | Original BI layer | Replaced by web dashboard |
| Mock Streamlit dashboard | Layout reference | Used as blueprint, unchanged |
| `web_dashboard/` | New static frontend | **New** |
| `docs/` | GitHub Pages deployment | **New** |

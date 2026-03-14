# Plan: Web-Based EV Dashboard Frontend (v2)

## Context

The EV Charging Infrastructure & Adoption Dashboard currently runs on Preset.io (Superset). For v2, we want a standalone web frontend that can be hosted as a shareable URL. The data pipeline (NREL API + Census API → Airflow → Snowflake → dbt) stays unchanged — we're only replacing the presentation layer.

## Architecture: Static Site + Pre-exported JSON

**Why this approach:**
- Data is small (~578 rows across 6 tables, <50KB as JSON) and updates at most daily
- No backend server needed at runtime — just static HTML/CSS/JS
- No Snowflake credentials exposed in the deployed site
- Free hosting on GitHub Pages or Netlify
- Plotly.js is the JS version of the same Plotly library used in the mock dashboard — 1:1 chart translation

```
[Snowflake analytics tables]
        ↓ (python export_data.py — runs locally)
[JSON files in web_dashboard/data/]
        ↓ (git push)
[GitHub Pages / Netlify — static site]
        ↓
[Shareable URL]
```

## New Files

```
ev-charging-stations-dashboard/
└── web_dashboard/
    ├── export_data.py              # Snowflake → JSON exporter
    ├── index.html                  # Single-page dashboard
    ├── css/
    │   └── dashboard.css           # Grid layout, KPI cards, responsive
    ├── js/
    │   └── dashboard.js            # 12 chart render functions (Plotly.js)
    └── data/                       # Exported JSON (git-tracked)
        ├── kpis.json
        ├── stations_by_state.json
        ├── stations_by_city.json
        ├── ev_density.json
        ├── adoption_vs_infrastructure.json
        ├── stations_by_region.json
        └── stations_over_time.json
```

## Implementation Steps

### Step 1: `export_data.py`
- Connect to Snowflake using existing env vars from `.env` (`SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, etc.)
- Query 6 analytics tables: `fct_ev_stations_by_state`, `fct_ev_stations_by_city` (top 25), `fct_ev_density`, `fct_ev_adoption_vs_infrastructure`, `fct_ev_stations_by_region`, `fct_ev_stations_over_time`
- Compute KPIs (total stations, total EVs, avg EVs per station) from `fct_ev_adoption_vs_infrastructure`
- Write 7 JSON files to `web_dashboard/data/`

### Step 2: `index.html`
- Single-page HTML with `<div>` placeholders for all 12 charts
- Load Plotly.js from CDN
- 3 sections matching the Preset.io layout:
  - **Overview**: KPI tiles → choropleth map → top 15 states + DC fast vs L2 (side by side) → top 20 cities → growth over time
  - **EV Adoption & Infrastructure Metrics**: scatter + gap ranking (side by side) → DC fast penetration + L2 ports/station (side by side)
  - **Regional Breakdowns**: regional stations + EVs per station (side by side)

### Step 3: `dashboard.css`
- CSS Grid for 2-column layouts
- KPI cards: white background, subtle shadow, large number, gray subtitle
- Section headers with dividers
- Font: Inter (Google Fonts) or system sans-serif
- Color palette: blues (`#3B82F6`), amber (`#F59E0B`), red (`#EF4444`)
- Responsive: stack to 1 column on mobile (<768px)

### Step 4: `dashboard.js`
Translate all 12 charts from `mock_dashboard/app.py` Plotly Python → Plotly.js:

| # | Chart | Source JSON | Reference in app.py |
|---|-------|-------------|---------------------|
| 1 | KPI tiles (3) | `kpis.json` | Lines 24-28 |
| 2 | Choropleth map | `ev_density.json` | Lines 33-55 |
| 3 | Top 15 States bar | `stations_by_state.json` | Lines 63-77 |
| 4 | DC Fast vs L2 stacked bar | `stations_by_state.json` | Lines 80-105 |
| 5 | Top 20 Cities bar | `stations_by_city.json` | Lines 158-170 |
| 6 | Growth Over Time area | `stations_over_time.json` | Lines 175-202 |
| 7 | Adoption scatter | `adoption_vs_infrastructure.json` | Lines 113-137 |
| 8 | Gap ranking bar | `adoption_vs_infrastructure.json` | Lines 140-153 |
| 9 | DC Fast penetration % | `stations_by_state.json` | Lines 207-223 |
| 10 | L2 Ports per Station | `stations_by_state.json` | Lines 228-256 |
| 11 | Regional Stations bar | `stations_by_region.json` | Lines 267-279 |
| 12 | Regional Gap bar | `stations_by_region.json` | Lines 282-295 |

Entry point loads all JSON via `Promise.all(fetch(...))`, then calls each render function.

### Step 5: Local Test
- `cd web_dashboard && python -m http.server 8000`
- Verify all 12 charts render with real data

### Step 6: Deploy
- Option A: GitHub Pages from `/docs` folder (copy `web_dashboard/` → `docs/`)
- Option B: Netlify drag-and-drop deploy
- Result: shareable URL like `https://priyanshusingh.github.io/ev-charging-stations-dashboard/`

## Data Refresh Workflow
```bash
# After dbt run completes:
cd web_dashboard && python export_data.py
git add data/ && git commit -m "refresh dashboard data" && git push
# GitHub Pages auto-deploys
```

## Automated Daily Refresh (Future Enhancement)

The dashboard data can be auto-refreshed daily at midnight so the site always shows the latest Snowflake data without manual intervention. Two approaches:

### Approach A: GitHub Actions Scheduled Workflow (Recommended)

A cron-triggered GitHub Actions workflow that runs `export_data.py`, commits updated JSON to `docs/data/`, and GitHub Pages auto-redeploys.

**Why this is the best fit:**
- Runs on GitHub's infrastructure — no dependency on local machine or Airflow container
- Snowflake credentials stored securely as GitHub repo secrets (never in code)
- Clean separation of concerns: Airflow handles ingestion/transforms, GitHub Actions handles dashboard refresh
- Free for public repos (2,000 minutes/month for private repos on free tier)

**Implementation:**
1. Add Snowflake credentials as GitHub repo secrets:
   - `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD`, `SNOWFLAKE_DATABASE`, `SNOWFLAKE_WAREHOUSE`, `SNOWFLAKE_ROLE`

2. Create `.github/workflows/refresh-dashboard.yml`:

```yaml
name: Refresh Dashboard Data

on:
  schedule:
    - cron: "0 0 * * *"   # midnight UTC daily
  workflow_dispatch:         # allow manual trigger

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: pip install snowflake-connector-python python-dotenv

      - name: Export data from Snowflake
        env:
          SNOWFLAKE_ACCOUNT: ${{ secrets.SNOWFLAKE_ACCOUNT }}
          SNOWFLAKE_USER: ${{ secrets.SNOWFLAKE_USER }}
          SNOWFLAKE_PASSWORD: ${{ secrets.SNOWFLAKE_PASSWORD }}
          SNOWFLAKE_DATABASE: ${{ secrets.SNOWFLAKE_DATABASE }}
          SNOWFLAKE_WAREHOUSE: ${{ secrets.SNOWFLAKE_WAREHOUSE }}
          SNOWFLAKE_ROLE: ${{ secrets.SNOWFLAKE_ROLE }}
        run: cd web_dashboard && python export_data.py

      - name: Copy to docs
        run: |
          cp web_dashboard/index.html docs/
          cp -r web_dashboard/css web_dashboard/js web_dashboard/data docs/

      - name: Commit and push if data changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add docs/data/ web_dashboard/data/
          git diff --cached --quiet || (git commit -m "chore: refresh dashboard data [automated]" && git push)
```

**Pros:**
- Zero infrastructure to manage
- Credentials never leave GitHub's secret store
- `workflow_dispatch` allows manual refresh on demand
- Only commits when data actually changes (no empty commits)
- GitHub Pages auto-redeploys on push

**Cons:**
- Decoupled from the Airflow pipeline — runs on a fixed schedule regardless of whether Airflow has ingested new data
- Cron is UTC-based (midnight UTC ≠ midnight local time)
- GitHub Actions minutes are limited on private repos

---

### Approach B: Airflow DAG Task

Append export + git push tasks to the existing `dag_dbt_transform.py`, so the dashboard refreshes immediately after every successful dbt run.

**Implementation:**
1. Add a new task to `dag_dbt_transform.py` after `dbt_test`:

```python
export_and_deploy = BashOperator(
    task_id="export_and_deploy_dashboard",
    bash_command="""
        cd /opt/airflow/web_dashboard && python export_data.py
        cp index.html /opt/airflow/docs/
        cp -r css js data /opt/airflow/docs/
        cd /opt/airflow
        git add docs/data/ web_dashboard/data/
        git diff --cached --quiet || (git commit -m "chore: refresh dashboard data [airflow]" && git push)
    """,
)

dbt_test >> export_and_deploy
```

2. Mount the repo directory into the Airflow Docker container
3. Configure git credentials (SSH key or GitHub personal access token) inside the container

**Pros:**
- Tightly coupled to the data pipeline — dashboard refreshes only when new data is actually available
- No separate scheduling to manage
- Single source of truth for orchestration

**Cons:**
- Requires git inside the Airflow Docker container (extra setup)
- Needs GitHub auth (SSH key or PAT) stored in the container env
- Adds complexity to the Airflow setup — mixing data pipeline concerns with deployment
- If the git push fails, it could block the DAG

---

### Recommendation

**Start with Approach A (GitHub Actions)** — it's simpler, keeps concerns separated, and doesn't require modifying the Airflow Docker setup. If tighter coupling with the data pipeline becomes important later, migrate to Approach B.

---

## Key Files to Reference During Implementation
- `mock_dashboard/app.py` — exact Plotly chart specs to translate
- `mock_dashboard/mock_data.py` — column names and data shapes
- `dbt/models/marts/*.sql` — actual column names from Snowflake
- `dbt/profiles.yml` — Snowflake connection env var names
- `.env` — credentials for export script

## Known Caveats
- `total_dc_fast_ports_partial` undercounts (~82% null in source). Use `stations_with_dc_fast` count for the DC Fast vs L2 stacked bar (matching Preset dashboard which shows station counts, not port counts)
- Region abbreviations (NE, SE, MW, SW, W) need mapping to full names in JS
- `fetch()` won't work from `file://` — must use local HTTP server for testing

## Verification
1. Run `export_data.py` — verify 7 JSON files appear in `data/`
2. Serve locally — verify all 12 charts render correctly
3. Compare side-by-side with Preset.io dashboard screenshot
4. Test responsive layout on mobile viewport
5. Deploy and confirm the URL is accessible

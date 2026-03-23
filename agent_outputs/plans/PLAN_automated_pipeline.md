# Plan: Automate EV Dashboard End-to-End Pipeline

**Date:** 2026-03-22
**Status:** Pending implementation

## Context

The EV dashboard pipeline currently stops at Snowflake — Airflow ingests data and runs dbt, but the final step (exporting JSON from Snowflake and deploying to GitHub Pages) is a manual 4-command process:

```bash
dbt run --target prod
python export_data.py          # queries Snowflake → 7 JSON files
cp index.html ../docs/ && cp -r css js data ../docs/
git add docs/ web_dashboard/data/ && git commit && git push
```

The F1 rivalry dashboard solves this by triggering a GitHub Actions workflow from Airflow after dbt completes. We replicate that pattern here.

**Current flow:** API → Airflow → Snowflake → dbt → **(manual)** → GitHub Pages
**Target flow:** API → Airflow → Snowflake → dbt → GitHub Actions → GitHub Pages (fully automated)

---

## Implementation Steps

### Step 1: Create GitHub Actions Workflow

**New file:** `.github/workflows/deploy-dashboard.yml`

**Triggers:**
- `workflow_dispatch` — called from Airflow after dbt completes
- `push` to `main` on `web_dashboard/**` paths only (manual source changes)

**Job steps:**
1. `actions/checkout@v4`
2. `actions/setup-python@v5` (Python 3.11)
3. `pip install snowflake-connector-python python-dotenv pandas`
4. Run `python web_dashboard/export_data.py` with Snowflake creds from GitHub Secrets
5. Copy `web_dashboard/{index.html,css,js,data}` → `docs/`
6. Check `git diff --quiet docs/` — skip commit if no changes
7. If changed: commit with `[skip ci]` message and push

**Design decisions:**
- `[skip ci]` in commit message + scoped `paths` filter (only `web_dashboard/**`, NOT `docs/**`) prevents infinite trigger loops
- `concurrency` group `dashboard-deploy` prevents parallel runs from conflicting on git push
- `permissions: contents: write` needed for pushing commits back

**GitHub Secrets required (one-time manual setup in repo settings):**
- `SNOWFLAKE_ACCOUNT`
- `SNOWFLAKE_USER`
- `SNOWFLAKE_PASSWORD`
- `SNOWFLAKE_DATABASE`
- `SNOWFLAKE_WAREHOUSE`
- `SNOWFLAKE_ROLE`

**Reference:** F1 project's `.github/workflows/deploy-evidence.yml`

---

### Step 2: Add `trigger_dashboard_deploy` Task to dbt DAG

**Modify:** `airflow/dags/dag_dbt_transform.py`

Add a `PythonOperator` task at the end of the chain that POSTs to the GitHub Actions API to dispatch the deploy workflow.

**Function logic:**
```python
def trigger_dashboard_deploy(**context):
    pat = os.environ.get("GITHUB_PAT")
    if not pat:
        log.warning("GITHUB_PAT not set — skipping dashboard deploy trigger")
        return

    resp = requests.post(
        "https://api.github.com/repos/singhpriyanshu5/us-ev-charging-stations-dashboard"
        "/actions/workflows/deploy-dashboard.yml/dispatches",
        json={"ref": "main"},
        headers={
            "Authorization": f"Bearer {pat}",
            "Accept": "application/vnd.github.v3+json",
        },
        timeout=15,
    )
    resp.raise_for_status()
```

**New task chain:** `dbt_run >> dbt_test >> trigger_dashboard_deploy`

**Key:** Gracefully skips with a warning if `GITHUB_PAT` is not set (matches F1 pattern).

**Reference:** F1 project's `f1_pipeline_dag.py` lines 476-493

---

### Step 3: Wire Census DAG into dbt Trigger Chain

**Modify:** `airflow/dags/dag_census_population_annual.py`

Currently `fetch_load` is the only task with no downstream trigger. Add:

```python
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

trigger_dbt = TriggerDagRunOperator(
    task_id="trigger_dbt_transform",
    trigger_dag_id="dbt_transform",
    wait_for_completion=False,
)

fetch_load >> trigger_dbt
```

This ensures annual population refreshes also rebuild models and deploy the dashboard.

---

### Step 4: Wire EV Registrations DAG into dbt Trigger Chain

**Modify:** `airflow/dags/dag_ev_registrations_historical.py`

Same pattern as census — add `TriggerDagRunOperator` after the `load` task:

```python
load >> trigger_dbt
```

Useful for manual re-triggers when the CSV is refreshed annually.

---

### Step 5: Add `GITHUB_PAT` to `.env`

**Modify:** `.env`

Add `GITHUB_PAT=` placeholder. The user provides their own PAT with `repo` scope (or fine-grained `actions:write`).

Already flows to Airflow containers via `env_file: ../.env` in `airflow/docker-compose.yml` — no docker-compose changes needed.

---

## Complete Automated Flow

```
NREL Daily (@daily)
  check_if_updated → fetch → load → trigger_dbt_transform
                                            ↓
Census Annual (@yearly)                dbt_transform
  fetch_load → trigger_dbt_transform   (dbt_run → dbt_test → trigger_dashboard_deploy)
                                                        ↓
EV Registrations (@once/manual)              GitHub Actions workflow
  load → trigger_dbt_transform        (export_data.py → copy to docs/ → git push)
                                                        ↓
                                              GitHub Pages auto-deploys
```

**API refresh cadences (unchanged, already sensible):**
- NREL AFDC: updates daily → `@daily` schedule
- US Census ACS5: updates yearly → `@yearly` schedule
- EV Registrations: no API (manual CSV) → `@once` + manual trigger

---

## Files to Modify/Create

| File | Action | Lines of Change (est.) |
|------|--------|----------------------|
| `.github/workflows/deploy-dashboard.yml` | **Create** | ~50 |
| `airflow/dags/dag_dbt_transform.py` | Add trigger task | ~25 |
| `airflow/dags/dag_census_population_annual.py` | Add TriggerDagRunOperator | ~8 |
| `airflow/dags/dag_ev_registrations_historical.py` | Add TriggerDagRunOperator | ~8 |
| `.env` | Add GITHUB_PAT placeholder | ~1 |

**No changes needed to:**
- `web_dashboard/export_data.py` — already CI-compatible (`load_dotenv()` silently no-ops if `.env` missing)
- `airflow/docker-compose.yml` — already loads `.env` via `env_file`
- `airflow/requirements.txt` — `requests` already installed

---

## Verification Plan

1. **GitHub Actions standalone:** Manually trigger `deploy-dashboard.yml` via GitHub UI → verify JSON files update in `docs/data/` and Pages deploys
2. **Airflow trigger task:** With `GITHUB_PAT` set, manually trigger `dbt_transform` DAG → verify it triggers GitHub Actions
3. **Full NREL chain:** Manually trigger `nrel_stations_daily` → verify: fetch → dbt → GitHub Actions → Pages deploy
4. **Census chain:** Manually trigger `census_population_annual` → verify it triggers dbt → deploy
5. **No-change case:** Run again with unchanged data → verify no empty commits are created
6. **Graceful fallback:** Remove `GITHUB_PAT` → verify `trigger_dashboard_deploy` logs warning and doesn't fail the DAG

"""
DAG 4: dbt Transform — runs after DAG 1 (NREL daily ingestion)
Executes dbt run then dbt test against the Snowflake warehouse.
After dbt completes, triggers the GitHub Actions deploy workflow
to export fresh data and publish to GitHub Pages.

Triggered automatically by dag_nrel_stations_daily via TriggerDagRunOperator.
Can also be triggered manually to rebuild all models.
"""

import logging
import os
from datetime import datetime, timedelta

import requests
from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator

log = logging.getLogger(__name__)

DBT_DIR = "/opt/airflow/dbt"
DBT_PROFILES_DIR = "/opt/airflow/dbt"

default_args = {
    "owner": "airflow",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    "dbt_transform",
    default_args=default_args,
    description="dbt run + test — transforms raw Snowflake data into analytics marts",
    schedule_interval=None,  # triggered by dag_nrel_stations_daily
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["ev", "dbt", "transform"],
) as dag:

    dbt_run = BashOperator(
        task_id="dbt_run",
        bash_command=(
            f"cd {DBT_DIR} && "
            f"dbt run --profiles-dir {DBT_PROFILES_DIR} --target prod"
        ),
    )

    dbt_test = BashOperator(
        task_id="dbt_test",
        bash_command=(
            f"cd {DBT_DIR} && "
            f"dbt test --profiles-dir {DBT_PROFILES_DIR} --target prod"
        ),
    )

    def trigger_dashboard_deploy(**context):
        """POST to GitHub Actions API to dispatch the deploy-dashboard workflow."""
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
        log.info("GitHub Actions deploy workflow dispatched successfully")

    trigger_deploy = PythonOperator(
        task_id="trigger_dashboard_deploy",
        python_callable=trigger_dashboard_deploy,
    )

    dbt_run >> dbt_test >> trigger_deploy

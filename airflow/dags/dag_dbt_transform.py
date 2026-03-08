"""
DAG 4: dbt Transform — runs after DAG 1 (NREL daily ingestion)
Executes dbt run then dbt test against the Snowflake warehouse.
Triggered automatically by dag_nrel_stations_daily via TriggerDagRunOperator.
Can also be triggered manually to rebuild all models.
"""

from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

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

    dbt_run >> dbt_test


# ── Add this trigger to dag_nrel_stations_daily ──────────────────────────────
# In dag_nrel_stations_daily.py, after the `load` task, add:
#
#   trigger_dbt = TriggerDagRunOperator(
#       task_id="trigger_dbt_transform",
#       trigger_dag_id="dbt_transform",
#       wait_for_completion=False,
#   )
#   check_update >> fetch >> load >> trigger_dbt
#
# This wires DAG 1 → DAG 4 automatically each day.
# ─────────────────────────────────────────────────────────────────────────────

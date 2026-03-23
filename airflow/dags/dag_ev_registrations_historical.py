"""
DAG 2: EV Registrations — Historical seed load
Reads ev_registrations_2024.csv (manually prepared from AFDC page — no API exists)
and loads into raw.ev_registrations. Run @once, then refresh annually.

IMPORTANT: If the CSV file is missing, this DAG fails with a clear error.
To refresh annually: update /opt/airflow/data/ev_registrations_<year>.csv,
update DATA_FILE below, and trigger the DAG manually.
"""

import csv
import os
from datetime import datetime, timedelta

import snowflake.connector
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

SNOWFLAKE_ACCOUNT = os.environ["SNOWFLAKE_ACCOUNT"]
SNOWFLAKE_USER = os.environ["SNOWFLAKE_USER"]
SNOWFLAKE_PASSWORD = os.environ["SNOWFLAKE_PASSWORD"]
SNOWFLAKE_DATABASE = os.environ["SNOWFLAKE_DATABASE"]
SNOWFLAKE_WAREHOUSE = os.environ.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")
SNOWFLAKE_ROLE = os.environ.get("SNOWFLAKE_ROLE", "SYSADMIN")

# Update this path when refreshing annually (e.g., ev_registrations_2025.csv)
DATA_FILE = "/opt/airflow/data/ev_registrations_2024.csv"


def _get_snowflake_conn():
    return snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        password=SNOWFLAKE_PASSWORD,
        database=SNOWFLAKE_DATABASE,
        warehouse=SNOWFLAKE_WAREHOUSE,
        role=SNOWFLAKE_ROLE,
    )


def load_registrations(**context):
    """Read CSV and upsert into raw.ev_registrations."""
    if not os.path.exists(DATA_FILE):
        raise FileNotFoundError(
            f"EV registrations seed file not found: {DATA_FILE}\n"
            "Manually download the state registration table from "
            "https://afdc.energy.gov/vehicle-registration and save it as this file."
        )

    rows = []
    with open(DATA_FILE, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append((
                row["state"].strip(),
                row["state_name"].strip(),
                int(row["year"]),
                int(row["ev_count"]),
                row["vehicle_type"].strip(),
            ))

    print(f"Read {len(rows)} rows from {DATA_FILE}")

    conn = _get_snowflake_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"USE DATABASE {SNOWFLAKE_DATABASE}")
        cur.execute("USE SCHEMA raw")

        # Delete existing rows for the same year(s) to allow clean reloads
        years = list({r[2] for r in rows})
        cur.execute(
            f"DELETE FROM ev_registrations WHERE year IN ({','.join(str(y) for y in years)})"
        )

        cur.executemany(
            """INSERT INTO ev_registrations
               (state, state_name, year, ev_count, vehicle_type)
               VALUES (%s, %s, %s, %s, %s)""",
            rows,
        )
        print(f"Loaded {len(rows)} rows into raw.ev_registrations")
    finally:
        conn.close()


default_args = {
    "owner": "airflow",
    "depends_on_past": False,
    "retries": 1,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    "ev_registrations_historical",
    default_args=default_args,
    description="One-time load of EV registration seed CSV into raw.ev_registrations",
    schedule_interval="@once",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["ev", "registrations", "seed"],
) as dag:

    load = PythonOperator(
        task_id="load_registrations",
        python_callable=load_registrations,
        provide_context=True,
    )

    trigger_dbt = TriggerDagRunOperator(
        task_id="trigger_dbt_transform",
        trigger_dag_id="dbt_transform",
        wait_for_completion=False,
    )

    load >> trigger_dbt

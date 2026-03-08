"""
DAG 3: US Census ACS5 Population — Annual pull
Fetches state-level population from the Census Bureau API (no key required).
Uses the 2022 ACS5 estimate (latest confirmed available as of 2024).
Upserts into raw.census_population.
"""

import os
from datetime import datetime, timedelta

import requests
import snowflake.connector
from airflow import DAG
from airflow.operators.python import PythonOperator

SNOWFLAKE_ACCOUNT = os.environ["SNOWFLAKE_ACCOUNT"]
SNOWFLAKE_USER = os.environ["SNOWFLAKE_USER"]
SNOWFLAKE_PASSWORD = os.environ["SNOWFLAKE_PASSWORD"]
SNOWFLAKE_DATABASE = os.environ["SNOWFLAKE_DATABASE"]
SNOWFLAKE_WAREHOUSE = os.environ.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")
SNOWFLAKE_ROLE = os.environ.get("SNOWFLAKE_ROLE", "SYSADMIN")

# Use the latest available ACS5 year. Update when a new vintage publishes.
CENSUS_YEAR = 2022
CENSUS_URL = f"https://api.census.gov/data/{CENSUS_YEAR}/acs/acs5"

# Puerto Rico (fips=72) excluded — dashboard covers 50 states + DC only
EXCLUDE_FIPS = {"72"}


def _get_snowflake_conn():
    return snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        password=SNOWFLAKE_PASSWORD,
        database=SNOWFLAKE_DATABASE,
        warehouse=SNOWFLAKE_WAREHOUSE,
        role=SNOWFLAKE_ROLE,
    )


def fetch_and_load_population(**context):
    """Fetch Census ACS5 state population and upsert into Snowflake."""
    params = {
        "get": "NAME,B01003_001E",
        "for": "state:*",
    }
    resp = requests.get(CENSUS_URL, params=params, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    # First row is headers: [NAME, B01003_001E, state]
    headers = data[0]
    records = data[1:]

    rows = []
    for rec in records:
        row = dict(zip(headers, rec))
        fips = row["state"]
        if fips in EXCLUDE_FIPS:
            continue
        fips_padded = fips.zfill(2)
        state_name = row["NAME"]
        population = int(row["B01003_001E"])
        rows.append((fips_padded, state_name, CENSUS_YEAR, population))

    print(f"Fetched {len(rows)} state population records for year {CENSUS_YEAR}")

    conn = _get_snowflake_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"USE DATABASE {SNOWFLAKE_DATABASE}")
        cur.execute("USE SCHEMA raw")

        # Delete existing rows for this year before reload
        cur.execute(f"DELETE FROM census_population WHERE year = {CENSUS_YEAR}")

        cur.executemany(
            """INSERT INTO census_population (state_fips, state_name, year, population)
               VALUES (%s, %s, %s, %s)""",
            rows,
        )
        print(f"Loaded {len(rows)} rows into raw.census_population (year={CENSUS_YEAR})")
    finally:
        conn.close()


default_args = {
    "owner": "airflow",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=10),
}

with DAG(
    "census_population_annual",
    default_args=default_args,
    description="Annual Census ACS5 state population pull into raw.census_population",
    schedule_interval="@yearly",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    tags=["ev", "census", "population"],
) as dag:

    fetch_load = PythonOperator(
        task_id="fetch_and_load_population",
        python_callable=fetch_and_load_population,
        provide_context=True,
    )

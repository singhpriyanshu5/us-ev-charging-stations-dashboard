"""
DAG 1: NREL EV Stations — Daily ingestion
Pulls all US EV stations from the NREL Alternative Fuels Station API.
Skips full pull if source data hasn't changed since last ingestion.
"""

import csv
import io
import json
import os
from datetime import datetime, timedelta, timezone

import requests
import snowflake.connector
from airflow import DAG
from airflow.operators.python import PythonOperator, ShortCircuitOperator
from airflow.operators.trigger_dagrun import TriggerDagRunOperator

NREL_API_KEY = os.environ["NREL_API_KEY"]
SNOWFLAKE_ACCOUNT = os.environ["SNOWFLAKE_ACCOUNT"]
SNOWFLAKE_USER = os.environ["SNOWFLAKE_USER"]
SNOWFLAKE_PASSWORD = os.environ["SNOWFLAKE_PASSWORD"]
SNOWFLAKE_DATABASE = os.environ["SNOWFLAKE_DATABASE"]
SNOWFLAKE_WAREHOUSE = os.environ.get("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")
SNOWFLAKE_ROLE = os.environ.get("SNOWFLAKE_ROLE", "SYSADMIN")

LAST_UPDATED_URL = "https://developer.nrel.gov/api/alt-fuel-stations/v1/last-updated.json"
STATIONS_CSV_URL = "https://developer.nrel.gov/api/alt-fuel-stations/v1.csv"
BATCH_SIZE = 5000
TMP_FILE = "/tmp/nrel_stations.json"


def _get_snowflake_conn():
    return snowflake.connector.connect(
        account=SNOWFLAKE_ACCOUNT,
        user=SNOWFLAKE_USER,
        password=SNOWFLAKE_PASSWORD,
        database=SNOWFLAKE_DATABASE,
        warehouse=SNOWFLAKE_WAREHOUSE,
        role=SNOWFLAKE_ROLE,
    )


def check_if_updated(**context):
    """
    Call NREL last-updated endpoint. Compare to our last ingestion timestamp
    in Snowflake. Return False (short-circuit) if data hasn't changed.
    """
    resp = requests.get(LAST_UPDATED_URL, params={"api_key": NREL_API_KEY}, timeout=30)
    resp.raise_for_status()
    nrel_last_updated_str = resp.json().get("last_updated")
    print(f"NREL last updated: {nrel_last_updated_str}")

    # Parse NREL timestamp
    nrel_last_updated = datetime.fromisoformat(
        nrel_last_updated_str.replace("Z", "+00:00")
    )

    # Check our last ingestion
    conn = _get_snowflake_conn()
    try:
        cur = conn.cursor()
        cur.execute("SELECT MAX(_ingested_at) FROM raw.ev_stations")
        row = cur.fetchone()
        our_last_ingested = row[0]
    finally:
        conn.close()

    if our_last_ingested is None:
        print("Table is empty — first run, proceeding with full pull.")
        return True

    our_last_ingested_utc = our_last_ingested.replace(tzinfo=timezone.utc)
    if nrel_last_updated <= our_last_ingested_utc:
        print(f"Data unchanged. Skipping pull. Our last ingest: {our_last_ingested_utc}")
        return False

    print(f"New data available. Proceeding with full pull.")
    return True


def fetch_stations(**context):
    """Download all US EV stations from NREL CSV endpoint (single request, no pagination).

    The JSON API ignores offset/page params and always returns the same 200 stations.
    The CSV endpoint returns all ~85k stations in one response (~6MB).
    EV Connector Types comes as a space-separated string; we convert to a JSON array.
    """
    params = {
        "api_key": NREL_API_KEY,
        "fuel_type": "ELEC",
        "country": "US",
    }
    resp = requests.get(STATIONS_CSV_URL, params=params, timeout=300)
    resp.raise_for_status()

    reader = csv.DictReader(io.StringIO(resp.text))
    all_stations = []
    for row in reader:
        connector_str = row.get("EV Connector Types", "") or ""
        connector_types = [c for c in connector_str.split() if c]
        all_stations.append({
            "id":                   row.get("ID"),
            "station_name":         row.get("Station Name"),
            "city":                 row.get("City"),
            "state":                row.get("State"),
            "zip":                  row.get("ZIP"),
            "latitude":             row.get("Latitude"),
            "longitude":            row.get("Longitude"),
            "ev_level1_evse_num":   row.get("EV Level1 EVSE Num") or None,
            "ev_level2_evse_num":   row.get("EV Level2 EVSE Num") or None,
            "ev_dc_fast_num":       row.get("EV DC Fast Count") or None,
            "ev_connector_types":   connector_types,
            "status_code":          row.get("Status Code"),
            "open_date":            row.get("Open Date") or None,
            "updated_at":           row.get("Updated At") or None,
        })

    with open(TMP_FILE, "w") as f:
        json.dump(all_stations, f)

    print(f"Total stations written to {TMP_FILE}: {len(all_stations)}")


def load_to_snowflake(**context):
    """TRUNCATE raw.ev_stations then bulk insert fresh data via a staging temp table.

    PARSE_JSON() cannot be used in a VALUES clause with executemany, so we:
    1. Load all data as strings into a temp table
    2. INSERT INTO raw.ev_stations with PARSE_JSON in a SELECT statement
    """
    with open(TMP_FILE) as f:
        stations = json.load(f)

    conn = _get_snowflake_conn()
    try:
        cur = conn.cursor()
        cur.execute(f"USE DATABASE {SNOWFLAKE_DATABASE}")
        cur.execute("USE SCHEMA raw")

        # Step 1: create a temp table with all-string columns
        cur.execute("""
            CREATE TEMP TABLE tmp_ev_stations (
                station_id          VARCHAR,
                station_name        VARCHAR,
                city                VARCHAR,
                state               VARCHAR,
                zip                 VARCHAR,
                latitude            VARCHAR,
                longitude           VARCHAR,
                ev_level1_evse_num  VARCHAR,
                ev_level2_evse_num  VARCHAR,
                ev_dc_fast_num      VARCHAR,
                ev_connector_types  VARCHAR,
                status_code         VARCHAR,
                open_date           VARCHAR,
                updated_at          VARCHAR
            )
        """)

        # Step 2: bulk insert into temp table as plain strings
        rows = [
            (
                str(s.get("id")) if s.get("id") is not None else None,
                s.get("station_name"),
                s.get("city"),
                s.get("state"),
                s.get("zip"),
                str(s.get("latitude")) if s.get("latitude") is not None else None,
                str(s.get("longitude")) if s.get("longitude") is not None else None,
                str(s.get("ev_level1_evse_num")) if s.get("ev_level1_evse_num") is not None else None,
                str(s.get("ev_level2_evse_num")) if s.get("ev_level2_evse_num") is not None else None,
                str(s.get("ev_dc_fast_num")) if s.get("ev_dc_fast_num") is not None else None,
                json.dumps(s.get("ev_connector_types") or []),
                s.get("status_code"),
                s.get("open_date"),
                s.get("updated_at"),
            )
            for s in stations
        ]

        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            cur.executemany("INSERT INTO tmp_ev_stations VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)", batch)
            print(f"Staged rows {i}–{i + len(batch)}")

        # Step 3: TRUNCATE real table and INSERT with proper casts + PARSE_JSON
        cur.execute("TRUNCATE TABLE ev_stations")
        cur.execute("""
            INSERT INTO ev_stations (
                station_id, station_name, city, state, zip,
                latitude, longitude,
                ev_level1_evse_num, ev_level2_evse_num, ev_dc_fast_num,
                ev_connector_types, status_code, open_date, updated_at
            )
            SELECT
                TRY_CAST(station_id AS INTEGER),
                station_name, city, state, zip,
                TRY_CAST(latitude AS FLOAT),
                TRY_CAST(longitude AS FLOAT),
                TRY_CAST(ev_level1_evse_num AS INTEGER),
                TRY_CAST(ev_level2_evse_num AS INTEGER),
                TRY_CAST(ev_dc_fast_num AS INTEGER),
                PARSE_JSON(ev_connector_types),
                status_code,
                TRY_CAST(open_date AS DATE),
                TRY_CAST(updated_at AS TIMESTAMP)
            FROM tmp_ev_stations
        """)

        print(f"Load complete. Total rows: {len(rows)}")
    finally:
        conn.close()


default_args = {
    "owner": "airflow",
    "depends_on_past": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
}

with DAG(
    "nrel_stations_daily",
    default_args=default_args,
    description="Daily NREL EV station snapshot into Snowflake raw.ev_stations",
    schedule_interval="@daily",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["ev", "nrel", "ingestion"],
) as dag:

    check_update = ShortCircuitOperator(
        task_id="check_if_updated",
        python_callable=check_if_updated,
        provide_context=True,
    )

    fetch = PythonOperator(
        task_id="fetch_stations",
        python_callable=fetch_stations,
        provide_context=True,
    )

    load = PythonOperator(
        task_id="load_to_snowflake",
        python_callable=load_to_snowflake,
        provide_context=True,
    )

    trigger_dbt = TriggerDagRunOperator(
        task_id="trigger_dbt_transform",
        trigger_dag_id="dbt_transform",
        wait_for_completion=False,
    )

    check_update >> fetch >> load >> trigger_dbt

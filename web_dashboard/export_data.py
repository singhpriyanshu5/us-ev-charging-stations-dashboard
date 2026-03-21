"""
Export Snowflake analytics tables to JSON files for the static web dashboard.

Usage:
    cd web_dashboard && python export_data.py

Requires env vars: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD,
                   SNOWFLAKE_DATABASE, SNOWFLAKE_WAREHOUSE, SNOWFLAKE_ROLE
"""

import json
import os
import sys
from decimal import Decimal
from pathlib import Path

import snowflake.connector
from dotenv import load_dotenv

# Load .env from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)

QUERIES = {
    "stations_by_state": """
        SELECT state, total_stations, open_stations, planned_stations,
               temp_unavailable_stations, total_level2_ports,
               stations_with_dc_fast, total_dc_fast_ports_partial,
               first_station_date
        FROM EV_ANALYTICS.analytics.fct_ev_stations_by_state
        ORDER BY total_stations DESC
    """,
    "stations_by_city": """
        SELECT state, city, total_stations, open_stations,
               total_level2_ports, stations_with_dc_fast,
               total_dc_fast_ports_partial
        FROM EV_ANALYTICS.analytics.fct_ev_stations_by_city
        ORDER BY total_stations DESC
    """,
    "ev_density": """
        SELECT state, state_name, population, population_year,
               total_stations, open_stations, stations_with_dc_fast,
               total_level2_ports, stations_per_100k,
               open_stations_per_100k, level2_ports_per_100k
        FROM EV_ANALYTICS.analytics.fct_ev_density
        ORDER BY stations_per_100k DESC
    """,
    "adoption_vs_infrastructure": """
        SELECT state, state_name, population, population_year,
               total_stations, open_stations, stations_with_dc_fast,
               stations_per_100k, ev_count, registration_year,
               evs_per_station, infrastructure_gap_score, ev_adoption_rate
        FROM EV_ANALYTICS.analytics.fct_ev_adoption_vs_infrastructure
        ORDER BY evs_per_station DESC
    """,
    "stations_by_region": """
        SELECT region, state_count, total_stations,
               stations_with_dc_fast, dc_fast_pct,
               total_population, total_ev_registrations,
               stations_per_100k, ev_adoption_rate, evs_per_station,
               total_area_sq_miles, stations_per_1000sqmi
        FROM EV_ANALYTICS.analytics.fct_ev_stations_by_region
        ORDER BY total_stations DESC
    """,
    "stations_over_time": """
        SELECT year, new_stations, new_dc_fast_stations,
               new_l2_only_stations, cumulative_stations,
               cumulative_dc_fast, cumulative_l2_only
        FROM EV_ANALYTICS.analytics.fct_ev_stations_over_time
        ORDER BY year
    """,
}


def get_connection():
    return snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        database=os.environ["SNOWFLAKE_DATABASE"],
        warehouse=os.environ["SNOWFLAKE_WAREHOUSE"],
        role=os.environ.get("SNOWFLAKE_ROLE", "SYSADMIN"),
    )


def query_to_records(conn, sql):
    cur = conn.cursor()
    cur.execute(sql)
    columns = [desc[0].lower() for desc in cur.description]
    rows = cur.fetchall()
    cur.close()
    records = []
    for row in rows:
        record = {}
        for col, val in zip(columns, row):
            if isinstance(val, Decimal):
                val = float(round(val, 4))
            elif hasattr(val, "isoformat"):
                val = val.isoformat()
            elif isinstance(val, float):
                val = round(val, 4)
            record[col] = val
        records.append(record)
    return records


def compute_kpis(adoption_data):
    total_stations = sum(r["total_stations"] or 0 for r in adoption_data)
    total_evs = sum(r["ev_count"] or 0 for r in adoption_data)
    avg_evs_per_station = round(total_evs / total_stations, 1) if total_stations else 0
    return {
        "total_stations": total_stations,
        "total_ev_registrations": total_evs,
        "avg_evs_per_station": avg_evs_per_station,
    }


def write_json(filename, data):
    filepath = DATA_DIR / filename
    with open(filepath, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  wrote {filepath.name} ({len(data) if isinstance(data, list) else 'object'})")


def main():
    print("Connecting to Snowflake...")
    conn = get_connection()

    print("Exporting tables:")
    all_data = {}
    for name, sql in QUERIES.items():
        records = query_to_records(conn, sql)
        write_json(f"{name}.json", records)
        all_data[name] = records

    kpis = compute_kpis(all_data["adoption_vs_infrastructure"])
    write_json("kpis.json", kpis)

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()

import numpy as np
import pandas as pd

np.random.seed(42)

STATES = [
    ("AL", "Alabama", "SE"), ("AK", "Alaska", "W"), ("AZ", "Arizona", "SW"),
    ("AR", "Arkansas", "SE"), ("CA", "California", "W"), ("CO", "Colorado", "W"),
    ("CT", "Connecticut", "NE"), ("DE", "Delaware", "NE"), ("FL", "Florida", "SE"),
    ("GA", "Georgia", "SE"), ("HI", "Hawaii", "W"), ("ID", "Idaho", "W"),
    ("IL", "Illinois", "MW"), ("IN", "Indiana", "MW"), ("IA", "Iowa", "MW"),
    ("KS", "Kansas", "MW"), ("KY", "Kentucky", "SE"), ("LA", "Louisiana", "SE"),
    ("ME", "Maine", "NE"), ("MD", "Maryland", "NE"), ("MA", "Massachusetts", "NE"),
    ("MI", "Michigan", "MW"), ("MN", "Minnesota", "MW"), ("MS", "Mississippi", "SE"),
    ("MO", "Missouri", "MW"), ("MT", "Montana", "W"), ("NE", "Nebraska", "MW"),
    ("NV", "Nevada", "W"), ("NH", "New Hampshire", "NE"), ("NJ", "New Jersey", "NE"),
    ("NM", "New Mexico", "SW"), ("NY", "New York", "NE"), ("NC", "North Carolina", "SE"),
    ("ND", "North Dakota", "MW"), ("OH", "Ohio", "MW"), ("OK", "Oklahoma", "SW"),
    ("OR", "Oregon", "W"), ("PA", "Pennsylvania", "NE"), ("RI", "Rhode Island", "NE"),
    ("SC", "South Carolina", "SE"), ("SD", "South Dakota", "MW"), ("TN", "Tennessee", "SE"),
    ("TX", "Texas", "SW"), ("UT", "Utah", "W"), ("VT", "Vermont", "NE"),
    ("VA", "Virginia", "SE"), ("WA", "Washington", "W"), ("WV", "West Virginia", "SE"),
    ("WI", "Wisconsin", "MW"), ("WY", "Wyoming", "W"),
]

# Approximate 2023 populations (in thousands) — real-world anchored
POPULATIONS = {
    "CA": 39_029, "TX": 30_030, "FL": 22_610, "NY": 19_678, "PA": 12_972,
    "IL": 12_582, "OH": 11_756, "GA": 10_912, "NC": 10_699, "MI": 10_034,
    "NJ":  9_261, "VA":  8_683, "WA":  7_785, "AZ":  7_359, "TN":  7_051,
    "MA":  7_029, "IN":  6_833, "MO":  6_178, "MD":  6_165, "WI":  5_893,
    "CO":  5_774, "MN":  5_707, "SC":  5_282, "AL":  5_074, "LA":  4_574,
    "KY":  4_512, "OR":  4_240, "OK":  4_020, "CT":  3_626, "UT":  3_380,
    "IA":  3_190, "NV":  3_177, "AR":  3_046, "MS":  2_940, "KS":  2_937,
    "NM":  2_113, "NE":  1_963, "ID":  1_939, "WV":  1_775, "HI":  1_440,
    "NH":  1_389, "ME":  1_385, "MT":  1_123, "RI":  1_094, "DE":    990,
    "SD":    909, "ND":    779, "AK":    733, "VT":    647, "WY":    581,
}

# Approximate total_stations anchored to real-world ordering
BASE_STATIONS = {
    "CA": 15000, "NY":  4800, "FL":  4200, "TX":  3800, "WA":  2800,
    "CO":  2500, "MA":  2200, "OR":  1900, "IL":  1800, "AZ":  1700,
    "NJ":  1600, "VA":  1500, "MD":  1400, "PA":  1350, "GA":  1200,
    "NV":  1100, "NC":  1050, "TN":   900, "MN":   850, "MI":   820,
    "CT":   800, "OH":   780, "UT":   750, "SC":   600, "WI":   580,
    "MO":   560, "IN":   520, "LA":   480, "KY":   450, "AL":   400,
    "HI":   390, "NM":   370, "OK":   350, "AR":   320, "ID":   310,
    "IA":   290, "KS":   270, "ME":   260, "NH":   250, "NE":   230,
    "MT":   210, "RI":   200, "DE":   190, "AK":   160, "MS":   150,
    "WV":   140, "VT":   130, "SD":   110, "ND":    90, "WY":    50,
}

# EV adoption factor — CA/WA/CO/MA/NV lead
ADOPTION_FACTOR = {
    "CA": 3.5, "WA": 2.8, "CO": 2.2, "MA": 2.0, "OR": 2.0,
    "NV": 1.9, "HI": 1.8, "VT": 1.7, "CT": 1.6, "NJ": 1.5,
    "MD": 1.4, "AZ": 1.3, "FL": 1.2, "NY": 1.2, "MN": 1.1,
    "TX": 1.0, "GA": 0.9, "IL": 0.9, "VA": 0.9, "NC": 0.85,
    "UT": 0.85, "MI": 0.8, "PA": 0.75, "OH": 0.7, "WI": 0.7,
    "TN": 0.65, "SC": 0.65, "IN": 0.6, "MO": 0.6, "KY": 0.55,
    "LA": 0.55, "AL": 0.5, "AR": 0.5, "OK": 0.5, "KS": 0.5,
    "NM": 0.5, "IA": 0.5, "NE": 0.45, "ID": 0.45, "ME": 0.45,
    "NH": 0.45, "MT": 0.4, "RI": 0.5, "DE": 0.6, "AK": 0.35,
    "MS": 0.35, "WV": 0.35, "SD": 0.35, "ND": 0.3, "WY": 0.3,
}


def get_state_data() -> pd.DataFrame:
    rows = []
    for abbr, name, region in STATES:
        pop = POPULATIONS[abbr] * 1000  # actual people
        total_stations = int(BASE_STATIONS[abbr] * np.random.uniform(0.92, 1.08))
        open_stations = int(total_stations * np.random.uniform(0.85, 0.95))
        planned_stations = int(total_stations * np.random.uniform(0.05, 0.15))
        level2_ports = int(total_stations * np.random.uniform(2.5, 4.0))
        dc_fast_ports = int(total_stations * np.random.uniform(0.3, 0.8))
        total_ports = level2_ports + dc_fast_ports

        factor = ADOPTION_FACTOR.get(abbr, 0.6)
        ev_registrations = int(pop / 100_000 * factor * np.random.uniform(900, 1100))

        stations_per_100k = round(total_stations / pop * 100_000, 2)
        evs_per_station = round(ev_registrations / total_stations, 1)
        ev_adoption_rate = round(ev_registrations / pop * 100_000, 2)

        rows.append({
            "state": abbr,
            "state_name": name,
            "region": region,
            "population": pop,
            "total_stations": total_stations,
            "open_stations": open_stations,
            "planned_stations": planned_stations,
            "total_level2_ports": level2_ports,
            "total_dc_fast_ports": dc_fast_ports,
            "total_ports": total_ports,
            "ev_registrations": ev_registrations,
            "stations_per_100k": stations_per_100k,
            "evs_per_station": evs_per_station,
            "ev_adoption_rate": ev_adoption_rate,
        })

    return pd.DataFrame(rows)


def get_timeseries_data() -> pd.DataFrame:
    """
    Simulate annual EV station openings and cumulative totals (2005–2024).
    Mirrors the shape of fct_ev_stations_over_time from Snowflake.
    Growth is modelled as exponential with a DC fast surge post-2018.
    """
    years = list(range(2005, 2025))
    # Simulate realistic cumulative totals anchored to ~85k by 2024
    cum_total = [200, 400, 750, 1400, 2700, 5000, 8500, 13000, 19000,
                 27000, 37000, 48000, 60000, 70000, 76000, 80000, 83000, 85000, 85500, 85800]
    # DC fast emerged seriously around 2012-2014; model its share growing over time
    dc_fast_share = [0.04, 0.05, 0.06, 0.07, 0.09, 0.10, 0.12, 0.14, 0.15,
                     0.16, 0.17, 0.18, 0.19, 0.20, 0.18, 0.16, 0.16, 0.17, 0.18, 0.183]

    rows = []
    prev = 0
    for i, yr in enumerate(years):
        noise = np.random.uniform(0.95, 1.05)
        cum = int(cum_total[i] * noise)
        new = max(0, cum - prev)
        dc_share = dc_fast_share[i]
        rows.append({
            "year": yr,
            "new_stations": new,
            "new_dc_fast_stations": int(new * dc_share),
            "new_l2_only_stations": int(new * (1 - dc_share)),
            "cumulative_stations": cum,
            "cumulative_dc_fast": int(cum * dc_share),
            "cumulative_l2_only": int(cum * (1 - dc_share)),
        })
        prev = cum

    return pd.DataFrame(rows)


def get_region_data() -> pd.DataFrame:
    """
    Regional rollup — mirrors fct_ev_stations_by_region from Snowflake.
    Aggregates the state mock data by region.
    """
    df = get_state_data()
    region_map = {abbr: region for abbr, _, region in STATES}
    df["region"] = df["state"].map(region_map)

    grp = df.groupby("region").agg(
        state_count=("state", "count"),
        total_stations=("total_stations", "sum"),
        stations_with_dc_fast=("total_dc_fast_ports", lambda x: (x > 0).sum()),
        total_population=("population", "sum"),
        total_ev_registrations=("ev_registrations", "sum"),
    ).reset_index()

    grp["dc_fast_pct"] = (grp["stations_with_dc_fast"] / grp["total_stations"] * 100).round(1)
    grp["stations_per_100k"] = (grp["total_stations"] / grp["total_population"] * 100_000).round(2)
    grp["ev_adoption_rate"] = (grp["total_ev_registrations"] / grp["total_population"] * 100_000).round(2)
    grp["evs_per_station"] = (grp["total_ev_registrations"] / grp["total_stations"]).round(1)

    return grp.sort_values("total_stations", ascending=False)


def get_city_data() -> pd.DataFrame:
    cities = [
        ("Los Angeles",    "CA", 3800, 9500,  950),
        ("San Francisco",  "CA", 1900, 4800,  480),
        ("San Diego",      "CA", 1200, 3100,  310),
        ("San Jose",       "CA",  900, 2300,  230),
        ("Sacramento",     "CA",  750, 1900,  190),
        ("New York",       "NY", 2100, 5300,  530),
        ("Seattle",        "WA", 1600, 4100,  410),
        ("Portland",       "OR",  950, 2400,  240),
        ("Denver",         "CO",  980, 2500,  250),
        ("Chicago",        "IL",  850, 2100,  210),
        ("Boston",         "MA",  820, 2000,  200),
        ("Austin",         "TX",  700, 1800,  180),
        ("Houston",        "TX",  680, 1700,  170),
        ("Dallas",         "TX",  620, 1600,  160),
        ("Phoenix",        "AZ",  680, 1700,  170),
        ("Miami",          "FL",  620, 1600,  160),
        ("Atlanta",        "GA",  580, 1500,  150),
        ("Las Vegas",      "NV",  550, 1400,  140),
        ("Minneapolis",    "MN",  420, 1050,  105),
        ("Nashville",      "TN",  390,  980,   98),
        ("Charlotte",      "NC",  370,  930,   93),
        ("Philadelphia",   "PA",  410, 1030,  103),
        ("Washington DC",  "DC",  490, 1230,  123),
        ("Salt Lake City", "UT",  350,  880,   88),
        ("Honolulu",       "HI",  310,  780,   78),
    ]
    rows = []
    for city, state, stations, l2, dcf in cities:
        noise = np.random.uniform(0.93, 1.07)
        rows.append({
            "city": city,
            "state": state,
            "total_stations": int(stations * noise),
            "level2_ports": int(l2 * noise),
            "dc_fast_ports": int(dcf * noise),
        })
    return pd.DataFrame(rows)

import streamlit as st
import plotly.express as px
import plotly.graph_objects as go
from mock_data import get_state_data, get_city_data

st.set_page_config(
    page_title="EV Charging Infrastructure Dashboard",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Data ──────────────────────────────────────────────────────────────────────
df = get_state_data()
cities = get_city_data()

# ── Header ────────────────────────────────────────────────────────────────────
st.title("EV Charging Infrastructure & Adoption Dashboard")
st.caption("Note: All data is simulated for layout preview purposes.")
st.divider()

# ── Row 0: KPI Tiles ──────────────────────────────────────────────────────────
k1, k2, k3, k4 = st.columns(4)
k1.metric("Total EV Stations (US)", f"{df['total_stations'].sum():,}")
k2.metric("Total EV Registrations", f"{df['ev_registrations'].sum():,}")
k3.metric("Avg Stations per 100k People", f"{df['stations_per_100k'].mean():.1f}")
k4.metric("States with Gap Score > 50", int((df["evs_per_station"] > 50).sum()))

st.divider()

# ── Row 1: Choropleth ─────────────────────────────────────────────────────────
fig_map = px.choropleth(
    df,
    locations="state",
    locationmode="USA-states",
    color="stations_per_100k",
    scope="usa",
    color_continuous_scale="Blues",
    hover_name="state_name",
    hover_data={
        "state": False,
        "total_stations": True,
        "stations_per_100k": True,
        "ev_registrations": True,
    },
    labels={
        "stations_per_100k": "Stations / 100k",
        "total_stations": "Total Stations",
        "ev_registrations": "EV Registrations",
    },
    title="EV Station Density by State (Stations per 100k People)",
)
fig_map.update_layout(margin={"r": 0, "t": 40, "l": 0, "b": 0}, height=450)
st.plotly_chart(fig_map, use_container_width=True)

st.divider()

# ── Row 2: Station Volume + Port Mix ─────────────────────────────────────────
col_left, col_right = st.columns([6, 4])

with col_left:
    top15 = df.nlargest(15, "total_stations").sort_values("total_stations")
    fig_bar = px.bar(
        top15,
        x="total_stations",
        y="state",
        orientation="h",
        color="total_stations",
        color_continuous_scale="Blues",
        title="Top 15 States by Total EV Stations",
        labels={"total_stations": "Total Stations", "state": "State"},
        text="total_stations",
    )
    fig_bar.update_traces(texttemplate="%{text:,}", textposition="outside")
    fig_bar.update_layout(coloraxis_showscale=False, margin={"t": 40}, height=480)
    st.plotly_chart(fig_bar, use_container_width=True)

with col_right:
    top10 = df.nlargest(10, "total_stations").sort_values("total_stations")
    fig_stack = go.Figure()
    fig_stack.add_trace(go.Bar(
        name="Level 2 Ports",
        y=top10["state"],
        x=top10["total_level2_ports"],
        orientation="h",
        marker_color="#3B82F6",
    ))
    fig_stack.add_trace(go.Bar(
        name="DC Fast Ports",
        y=top10["state"],
        x=top10["total_dc_fast_ports"],
        orientation="h",
        marker_color="#F59E0B",
    ))
    fig_stack.update_layout(
        barmode="stack",
        title="Port Mix: Level 2 vs DC Fast (Top 10 States)",
        xaxis_title="Port Count",
        yaxis_title="State",
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        margin={"t": 60},
        height=480,
    )
    st.plotly_chart(fig_stack, use_container_width=True)

st.divider()

# ── Row 3: Scatter + Gap Ranking ──────────────────────────────────────────────
col_l, col_r = st.columns(2)

with col_l:
    fig_scatter = px.scatter(
        df,
        x="ev_adoption_rate",
        y="stations_per_100k",
        size="total_stations",
        color="evs_per_station",
        color_continuous_scale="RdYlGn_r",
        hover_name="state_name",
        hover_data={
            "ev_adoption_rate": ":.1f",
            "stations_per_100k": ":.2f",
            "total_stations": ":,",
            "evs_per_station": ":.1f",
        },
        labels={
            "ev_adoption_rate": "EV Adoption Rate (EVs per 100k)",
            "stations_per_100k": "Stations per 100k People",
            "evs_per_station": "EVs per Station (Gap)",
            "total_stations": "Total Stations",
        },
        title="EV Adoption vs Station Density (bubble = station count, color = gap score)",
        size_max=60,
    )
    fig_scatter.update_layout(height=480, margin={"t": 50})
    st.plotly_chart(fig_scatter, use_container_width=True)

with col_r:
    gap15 = df.nlargest(15, "evs_per_station").sort_values("evs_per_station")
    fig_gap = px.bar(
        gap15,
        x="evs_per_station",
        y="state",
        orientation="h",
        color_discrete_sequence=["#EF4444"],
        title="Infrastructure Gap Ranking — Top 15 Underserved States<br><sup>(EVs per Station — higher = more underserved)</sup>",
        labels={"evs_per_station": "EVs per Station", "state": "State"},
        text="evs_per_station",
    )
    fig_gap.update_traces(texttemplate="%{text:.1f}", textposition="outside")
    fig_gap.update_layout(height=480, margin={"t": 60}, showlegend=False)
    st.plotly_chart(fig_gap, use_container_width=True)

st.divider()

# ── Row 4: Top 20 Cities ──────────────────────────────────────────────────────
top20 = cities.nlargest(20, "total_stations").sort_values("total_stations", ascending=False)
fig_cities = px.bar(
    top20,
    x="city",
    y="total_stations",
    color="state",
    title="Top 20 Cities by EV Station Count",
    labels={"total_stations": "Total Stations", "city": "City", "state": "State"},
    text="total_stations",
)
fig_cities.update_traces(texttemplate="%{text:,}", textposition="outside")
fig_cities.update_layout(height=460, margin={"t": 50}, xaxis_tickangle=-35)
st.plotly_chart(fig_cities, use_container_width=True)

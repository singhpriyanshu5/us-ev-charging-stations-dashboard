// ── Constants ────────────────────────────────────────────────────────────────
// Palette
const TEAL = "#5AC8C8";
const TEAL_DARK = "#2A7F8F";
const BLUE = "#3B82F6";
const AMBER = "#E8943A";
const CORAL = "#E07B73";

// Light teal colorscale — used ONLY for the choropleth map
const TEAL_MAP_SCALE = [
    [0, "#f0fafa"],
    [0.15, "#d4f0f0"],
    [0.35, "#a8e0e0"],
    [0.55, "#7ccfcf"],
    [0.75, "#4db8b8"],
    [1, "#1a8a8a"],
];

const REGION_LABELS = {
    NE: "Northeast",
    SE: "Southeast",
    MW: "Midwest",
    SW: "Southwest",
    W: "West",
};

const PLOTLY_CONFIG = {
    responsive: true,
    displayModeBar: false,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n) {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
    return n.toLocaleString();
}

function sortBy(arr, key, asc = true) {
    return [...arr].sort((a, b) => (asc ? a[key] - b[key] : b[key] - a[key]));
}

function topN(arr, key, n) {
    return sortBy(arr, key, false).slice(0, n);
}

// ── KPI Tiles ────────────────────────────────────────────────────────────────
function renderKPIs(kpis) {
    document.querySelector("#kpi-stations .kpi-value").textContent = formatNum(kpis.total_stations);
    document.querySelector("#kpi-evs .kpi-value").textContent = formatNum(kpis.total_ev_registrations);
    document.querySelector("#kpi-gap .kpi-value").textContent = formatNum(kpis.avg_evs_per_station);
}

// ── Chart 1: Choropleth Map ─────────────────────────────────────────────────
function renderChoropleth(density) {
    const trace = {
        type: "choropleth",
        locationmode: "USA-states",
        locations: density.map(d => d.state),
        z: density.map(d => d.stations_per_100k),
        text: density.map(d => d.state_name),
        colorscale: TEAL_MAP_SCALE,
        colorbar: { title: "Stations / 100k" },
        hovertemplate:
            "<b>%{text}</b><br>" +
            "Stations per 100k: %{z:.1f}<br>" +
            "Total Stations: %{customdata[0]:,}<br>" +
            "<extra></extra>",
        customdata: density.map(d => [d.total_stations]),
    };
    const layout = {
        title: { text: "EV Station Density (Stations per 100k People) by State", font: { size: 14 } },
        geo: { scope: "usa", bgcolor: "rgba(0,0,0,0)" },
        margin: { r: 0, t: 40, l: 0, b: 0 },
        height: 450,
        paper_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-choropleth", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 2: Top 15 States by EV Stations ───────────────────────────────────
function renderTop15States(states) {
    const top15 = topN(states, "total_stations", 15).reverse();
    const trace = {
        type: "bar",
        orientation: "h",
        x: top15.map(d => d.total_stations),
        y: top15.map(d => d.state),
        text: top15.map(d => d.total_stations.toLocaleString()),
        textposition: "outside",
        marker: {
            color: top15.map(d => d.total_stations),
            colorscale: "Blues",
            showscale: false,
        },
    };
    const layout = {
        title: { text: "Top 15 States by Total EV Stations", font: { size: 14 } },
        xaxis: { title: "Total Stations" },
        yaxis: { title: "" },
        margin: { t: 40, l: 40, r: 60 },
        height: 480,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-top15-states", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 3: DC Fast vs L2 Stations (Top 10) ───────────────────────────────
function renderDCFastVsL2(states) {
    const top10 = topN(states, "total_stations", 10).reverse();
    const l2Only = top10.map(d => d.total_stations - d.stations_with_dc_fast);
    const dcFast = top10.map(d => d.stations_with_dc_fast);
    const labels = top10.map(d => d.state);

    const traceL2 = {
        type: "bar",
        orientation: "h",
        name: "L2 Only Stations",
        x: l2Only,
        y: labels,
        marker: { color: BLUE },
    };
    const traceDC = {
        type: "bar",
        orientation: "h",
        name: "DC Fast Stations",
        x: dcFast,
        y: labels,
        marker: { color: AMBER },
    };
    const layout = {
        title: { text: "DC Fast vs L2 Only Stations — Top 10 States", font: { size: 14 } },
        barmode: "stack",
        xaxis: { title: "Station Count" },
        yaxis: { title: "" },
        legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1 },
        margin: { t: 60, l: 40, r: 20 },
        height: 480,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-dcfast-vs-l2", [traceL2, traceDC], layout, PLOTLY_CONFIG);
}

// ── Chart 4: Top 20 Cities ──────────────────────────────────────────────────
function renderTop20Cities(cities) {
    const top20 = topN(cities, "total_stations", 20);
    const trace = {
        type: "bar",
        x: top20.map(d => d.city),
        y: top20.map(d => d.total_stations),
        text: top20.map(d => d.total_stations.toLocaleString()),
        textposition: "outside",
        marker: {
            color: top20.map(d => d.stations_with_dc_fast),
            colorscale: "Blues",
            showscale: false,
        },
        hovertemplate:
            "<b>%{x}</b> (%{customdata})<br>" +
            "Stations: %{y:,}<extra></extra>",
        customdata: top20.map(d => d.state),
    };
    const layout = {
        title: { text: "Top 20 Cities by EV Station Count", font: { size: 14 } },
        xaxis: { title: "City", tickangle: -35 },
        yaxis: { title: "Total Stations" },
        margin: { t: 50, b: 100 },
        height: 460,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-top20-cities", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 5: Station Growth Over Time ───────────────────────────────────────
function renderGrowthOverTime(timeseries) {
    const traceL2 = {
        type: "scatter",
        mode: "lines",
        name: "L2 Only (cumulative)",
        x: timeseries.map(d => d.year),
        y: timeseries.map(d => d.cumulative_l2_only),
        stackgroup: "one",
        line: { color: BLUE },
        fillcolor: "rgba(59,130,246,0.30)",
    };
    const traceDC = {
        type: "scatter",
        mode: "lines",
        name: "DC Fast Capable (cumulative)",
        x: timeseries.map(d => d.year),
        y: timeseries.map(d => d.cumulative_dc_fast),
        stackgroup: "one",
        line: { color: AMBER },
        fillcolor: "rgba(232,148,58,0.45)",
    };
    const layout = {
        title: { text: "Station Growth Over Time — Cumulative by Charger Type", font: { size: 14 } },
        xaxis: { title: "Year" },
        yaxis: { title: "Cumulative Stations" },
        legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1 },
        margin: { t: 60 },
        height: 420,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-growth", [traceL2, traceDC], layout, PLOTLY_CONFIG);
}

// ── Chart 6: Adoption vs Infrastructure Scatter ─────────────────────────────
function renderAdoptionScatter(adoption) {
    const trace = {
        type: "scatter",
        mode: "markers",
        x: adoption.map(d => d.ev_adoption_rate),
        y: adoption.map(d => d.stations_per_100k),
        text: adoption.map(d => d.state_name),
        marker: {
            size: adoption.map(d => Math.max(d.total_stations / 200, 8)),
            sizemode: "area",
            sizeref: 0.5,
            color: adoption.map(d => d.evs_per_station),
            colorscale: "RdYlGn",
            reversescale: true,
            colorbar: { title: "EVs/Station" },
        },
        hovertemplate:
            "<b>%{text}</b><br>" +
            "Adoption Rate: %{x:.1f}<br>" +
            "Stations/100k: %{y:.2f}<br>" +
            "Total Stations: %{customdata[0]:,}<br>" +
            "Gap Score: %{customdata[1]:.1f}<br>" +
            "<extra></extra>",
        customdata: adoption.map(d => [d.total_stations, d.evs_per_station]),
    };
    const layout = {
        title: {
            text: "EV Adoption vs Infrastructure by State",
            font: { size: 14 },
        },
        xaxis: { title: "EV Adoption Rate (EVs per 100k)" },
        yaxis: { title: "Stations per 100k People" },
        margin: { t: 50 },
        height: 480,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-adoption-scatter", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 7: Infrastructure Gap Ranking ─────────────────────────────────────
function renderGapRanking(adoption) {
    const top20 = topN(adoption, "evs_per_station", 20).reverse();
    const trace = {
        type: "bar",
        orientation: "h",
        x: top20.map(d => d.evs_per_station),
        y: top20.map(d => d.state),
        text: top20.map(d => d.evs_per_station.toFixed(1)),
        textposition: "outside",
        marker: {
            color: top20.map(d => d.evs_per_station),
            colorscale: [[0, "#fcd5d0"], [1, "#c0392b"]],
            showscale: false,
        },
    };
    const layout = {
        title: {
            text: "Infrastructure Gap Ranking by State (Top 20)<br><sub>EVs per Station — higher = more underserved</sub>",
            font: { size: 14 },
        },
        xaxis: { title: "EVs per Station" },
        yaxis: { title: "" },
        margin: { t: 70, l: 40, r: 60 },
        height: 480,
        showlegend: false,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-gap-ranking", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 8: DC Fast Penetration % ──────────────────────────────────────────
function renderDCFastPenetration(states) {
    const withPct = states.map(d => ({
        ...d,
        dc_fast_pct: d.total_stations > 0
            ? Math.round(d.stations_with_dc_fast / d.total_stations * 1000) / 10
            : 0,
    }));
    const top20 = topN(withPct, "dc_fast_pct", 20).reverse();
    const trace = {
        type: "bar",
        orientation: "h",
        x: top20.map(d => d.dc_fast_pct),
        y: top20.map(d => d.state),
        text: top20.map(d => d.dc_fast_pct.toFixed(1) + "%"),
        textposition: "outside",
        marker: {
            color: top20.map(d => d.dc_fast_pct),
            colorscale: [[0, "#fde8c8"], [0.5, "#E8943A"], [1, "#c06820"]],
            showscale: false,
        },
    };
    const layout = {
        title: {
            text: "DC Fast Penetration % by State (Top 20)<br><sub>% of stations with DC fast capability</sub>",
            font: { size: 14 },
        },
        xaxis: { title: "DC Fast %" },
        yaxis: { title: "" },
        margin: { t: 70, l: 40, r: 60 },
        height: 480,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-dcfast-pct", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 9: L2 Ports per Station ───────────────────────────────────────────
function renderL2PortsPerStation(states) {
    const withRatio = states.map(d => ({
        ...d,
        l2_per_station: d.total_stations > 0
            ? Math.round(d.total_level2_ports / d.total_stations * 10) / 10
            : 0,
    }));
    const bottom20 = sortBy(withRatio, "l2_per_station", true).slice(0, 20);
    const trace = {
        type: "bar",
        orientation: "h",
        x: bottom20.map(d => d.l2_per_station),
        y: bottom20.map(d => d.state),
        text: bottom20.map(d => d.l2_per_station.toFixed(1)),
        textposition: "outside",
        marker: {
            color: bottom20.map(d => d.l2_per_station),
            colorscale: "Blues",
            showscale: false,
        },
    };
    const layout = {
        title: {
            text: "L2 Ports per Station by State (Bottom 20)<br><sub>Lower = mostly single-port stations</sub>",
            font: { size: 14 },
        },
        xaxis: { title: "L2 Ports / Station" },
        yaxis: { title: "" },
        margin: { t: 70, l: 40, r: 60 },
        height: 480,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-l2-per-station", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 10: Regional Station Count ────────────────────────────────────────
function renderRegionalStations(regions) {
    const labels = regions.map(d => REGION_LABELS[d.region] || d.region);
    const colors = ["#3B82F6", "#E8943A", "#10B981", "#8B5CF6", "#E07B73"];
    const trace = {
        type: "bar",
        x: labels,
        y: regions.map(d => d.total_stations),
        text: regions.map(d => d.total_stations.toLocaleString()),
        textposition: "outside",
        marker: { color: colors.slice(0, regions.length) },
    };
    const layout = {
        title: { text: "Regional Station Count", font: { size: 14 } },
        xaxis: { title: "Region" },
        yaxis: { title: "Total Stations" },
        showlegend: false,
        margin: { t: 50 },
        height: 400,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-regional-stations", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 11: Regional EVs per Station ──────────────────────────────────────
function renderRegionalGap(regions) {
    const sorted = sortBy(regions, "evs_per_station", false);
    const labels = sorted.map(d => REGION_LABELS[d.region] || d.region);
    const trace = {
        type: "bar",
        x: labels,
        y: sorted.map(d => d.evs_per_station),
        text: sorted.map(d => d.evs_per_station.toFixed(1)),
        textposition: "outside",
        marker: {
            color: sorted.map(d => d.evs_per_station),
            colorscale: [[0, "#fde8c8"], [1, "#c0392b"]],
            showscale: false,
        },
    };
    const layout = {
        title: { text: "EVs per Station Breakdown by Region", font: { size: 14 } },
        xaxis: { title: "Region" },
        yaxis: { title: "EVs per Station" },
        showlegend: false,
        margin: { t: 50 },
        height: 400,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
    };
    Plotly.newPlot("chart-regional-gap", [trace], layout, PLOTLY_CONFIG);
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    try {
        const [kpis, states, cities, density, adoption, regions, timeseries] =
            await Promise.all([
                fetch("data/kpis.json").then(r => r.json()),
                fetch("data/stations_by_state.json").then(r => r.json()),
                fetch("data/stations_by_city.json").then(r => r.json()),
                fetch("data/ev_density.json").then(r => r.json()),
                fetch("data/adoption_vs_infrastructure.json").then(r => r.json()),
                fetch("data/stations_by_region.json").then(r => r.json()),
                fetch("data/stations_over_time.json").then(r => r.json()),
            ]);

        // Filter out records with null key metrics (e.g. Puerto Rico has no population data)
        const densityClean = density.filter(d => d.stations_per_100k != null);
        const adoptionClean = adoption.filter(d => d.evs_per_station != null);

        renderKPIs(kpis);
        renderChoropleth(densityClean);
        renderTop15States(states);
        renderDCFastVsL2(states);
        renderTop20Cities(cities);
        renderGrowthOverTime(timeseries);
        renderAdoptionScatter(adoptionClean);
        renderGapRanking(adoptionClean);
        renderDCFastPenetration(states);
        renderL2PortsPerStation(states);
        renderRegionalStations(regions);
        renderRegionalGap(regions);
    } catch (err) {
        console.error("Failed to load dashboard data:", err);
        document.querySelector(".dashboard-container").innerHTML =
            '<p style="text-align:center;padding:40px;color:#ef4444;">Failed to load data. Run <code>python export_data.py</code> first, then serve via HTTP server.</p>';
    }
}

document.addEventListener("DOMContentLoaded", init);

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

// All chart div IDs for bulk theme updates
const CHART_IDS = [
    "chart-choropleth", "chart-top15-states", "chart-dcfast-vs-l2",
    "chart-top20-cities", "chart-growth", "chart-adoption-scatter",
    "chart-gap-ranking", "chart-dcfast-pct", "chart-l2-per-station",
    "chart-regional-stations", "chart-regional-gap",
];

// Global data store for modal drill-downs
let DATA = {};

// Timeline animation state
let timelineInterval = null;

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

// ── Theme Helpers ────────────────────────────────────────────────────────────
function getPlotlyTheme() {
    const isDark = document.documentElement.dataset.theme === "dark";
    return {
        paper_bgcolor: isDark ? "#1e293b" : "rgba(0,0,0,0)",
        plot_bgcolor: isDark ? "#1e293b" : "rgba(0,0,0,0)",
        fontColor: isDark ? "#e2e8f0" : "#1a1a2e",
        gridColor: isDark ? "#334155" : "#e2e8f0",
        geo_bgcolor: isDark ? "#1e293b" : "rgba(0,0,0,0)",
    };
}

function updateChartsTheme() {
    const t = getPlotlyTheme();
    const baseUpdate = {
        paper_bgcolor: t.paper_bgcolor,
        plot_bgcolor: t.plot_bgcolor,
        "font.color": t.fontColor,
        "xaxis.gridcolor": t.gridColor,
        "yaxis.gridcolor": t.gridColor,
        "xaxis.tickfont.color": t.fontColor,
        "yaxis.tickfont.color": t.fontColor,
        "title.font.color": t.fontColor,
        "legend.font.color": t.fontColor,
    };

    for (const id of CHART_IDS) {
        const el = document.getElementById(id);
        if (!el || !el.data) continue;

        if (id === "chart-choropleth") {
            Plotly.relayout(el, {
                ...baseUpdate,
                "geo.bgcolor": t.geo_bgcolor,
            });
            // Update colorbar tick/title font via restyle
            Plotly.restyle(el, {
                "colorbar.tickfont.color": t.fontColor,
                "colorbar.title.font.color": t.fontColor,
            }, [0]);
        } else if (id === "chart-adoption-scatter") {
            Plotly.relayout(el, baseUpdate);
            Plotly.restyle(el, {
                "marker.colorbar.tickfont.color": t.fontColor,
                "marker.colorbar.title.font.color": t.fontColor,
            }, [0]);
        } else {
            Plotly.relayout(el, baseUpdate);
        }
    }
}

function initThemeToggle() {
    const saved = localStorage.getItem("ev-dash-theme");
    if (saved) {
        document.documentElement.dataset.theme = saved;
    }

    document.getElementById("theme-toggle").addEventListener("click", () => {
        const current = document.documentElement.dataset.theme;
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.dataset.theme = next;
        localStorage.setItem("ev-dash-theme", next);
        updateChartsTheme();
    });
}

// ── KPI Tiles ────────────────────────────────────────────────────────────────
function renderKPIs(kpis) {
    document.querySelector("#kpi-stations .kpi-value").textContent = formatNum(kpis.total_stations);
    document.querySelector("#kpi-evs .kpi-value").textContent = formatNum(kpis.total_ev_registrations);
    document.querySelector("#kpi-gap .kpi-value").textContent = formatNum(kpis.avg_evs_per_station);
}

// ── Chart 1: Choropleth Map ─────────────────────────────────────────────────
function renderChoropleth(density) {
    const theme = getPlotlyTheme();
    const trace = {
        type: "choropleth",
        locationmode: "USA-states",
        locations: density.map(d => d.state),
        z: density.map(d => d.stations_per_100k),
        text: density.map(d => d.state_name),
        colorscale: TEAL_MAP_SCALE,
        colorbar: { title: "Stations / 100k", tickfont: { color: theme.fontColor } },
        hovertemplate:
            "<b>%{text}</b><br>" +
            "Stations per 100k: %{z:.1f}<br>" +
            "Total Stations: %{customdata[0]:,}<br>" +
            "<extra></extra>",
        customdata: density.map(d => [d.total_stations]),
    };
    const layout = {
        title: { text: "EV Station Density (Stations per 100k People) by State", font: { size: 14, color: theme.fontColor } },
        geo: { scope: "usa", bgcolor: theme.geo_bgcolor },
        margin: { r: 0, t: 40, l: 0, b: 0 },
        height: 450,
        paper_bgcolor: theme.paper_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-choropleth", [trace], layout, PLOTLY_CONFIG);

    // Drill-down click handler
    document.getElementById("chart-choropleth").on("plotly_click", (e) => {
        if (e.points && e.points.length > 0) {
            openStateModal(e.points[0].location);
        }
    });
}

// ── Chart 2: Top 15 States by EV Stations ───────────────────────────────────
function renderTop15States(states) {
    const theme = getPlotlyTheme();
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
        title: { text: "Top 15 States by Total EV Stations", font: { size: 14, color: theme.fontColor } },
        xaxis: { title: "Total Stations", gridcolor: theme.gridColor },
        yaxis: { title: "", gridcolor: theme.gridColor },
        margin: { t: 40, l: 40, r: 60 },
        height: 480,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-top15-states", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 3: DC Fast vs L2 Stations (Top 10) ───────────────────────────────
function renderDCFastVsL2(states) {
    const theme = getPlotlyTheme();
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
        title: { text: "DC Fast vs L2 Only Stations — Top 10 States", font: { size: 14, color: theme.fontColor } },
        barmode: "stack",
        xaxis: { title: "Station Count", gridcolor: theme.gridColor },
        yaxis: { title: "", gridcolor: theme.gridColor },
        legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1, font: { color: theme.fontColor } },
        margin: { t: 60, l: 40, r: 20 },
        height: 480,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-dcfast-vs-l2", [traceL2, traceDC], layout, PLOTLY_CONFIG);
}

// ── Chart 4: Top 20 Cities ──────────────────────────────────────────────────
function renderTop20Cities(cities) {
    const theme = getPlotlyTheme();
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
        title: { text: "Top 20 Cities by EV Station Count", font: { size: 14, color: theme.fontColor } },
        xaxis: { title: "City", tickangle: -35, gridcolor: theme.gridColor },
        yaxis: { title: "Total Stations", gridcolor: theme.gridColor },
        margin: { t: 50, b: 100 },
        height: 460,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-top20-cities", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 5: Station Growth Over Time ───────────────────────────────────────
function renderGrowthOverTime(timeseries) {
    const theme = getPlotlyTheme();
    const maxTotal = timeseries[timeseries.length - 1].cumulative_l2_only + timeseries[timeseries.length - 1].cumulative_dc_fast;
    const maxYear = timeseries[timeseries.length - 1].year;
    const minYear = timeseries[0].year;

    // Start fully revealed
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

    // Marker dot at the end point (trace index 2)
    const traceMarker = {
        type: "scatter",
        mode: "markers+text",
        name: "Selected Year",
        x: [maxYear],
        y: [maxTotal],
        text: [maxTotal.toLocaleString()],
        textposition: "top center",
        textfont: { color: TEAL, size: 13, family: "Inter" },
        marker: { color: TEAL, size: 14, line: { color: "#fff", width: 2 } },
        showlegend: false,
        hoverinfo: "skip",
    };

    const layout = {
        title: { text: "Station Growth Over Time — Cumulative by Charger Type", font: { size: 14, color: theme.fontColor } },
        xaxis: { title: "Year", gridcolor: theme.gridColor, range: [minYear - 0.5, maxYear + 0.5] },
        yaxis: { title: "Cumulative Stations", gridcolor: theme.gridColor, range: [0, maxTotal * 1.12] },
        legend: { orientation: "h", yanchor: "bottom", y: 1.02, xanchor: "right", x: 1, font: { color: theme.fontColor } },
        margin: { t: 60 },
        height: 420,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-growth", [traceL2, traceDC, traceMarker], layout, PLOTLY_CONFIG);
}

// ── Chart 6: Adoption vs Infrastructure Scatter ─────────────────────────────
function renderAdoptionScatter(adoption) {
    const theme = getPlotlyTheme();
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
            colorbar: { title: "EVs/Station", tickfont: { color: theme.fontColor } },
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
            font: { size: 14, color: theme.fontColor },
        },
        xaxis: { title: "EV Adoption Rate (EVs per 100k)", gridcolor: theme.gridColor },
        yaxis: { title: "Stations per 100k People", gridcolor: theme.gridColor },
        margin: { t: 50 },
        height: 480,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-adoption-scatter", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 7: Infrastructure Gap Ranking ─────────────────────────────────────
function renderGapRanking(adoption) {
    const theme = getPlotlyTheme();
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
            font: { size: 14, color: theme.fontColor },
        },
        xaxis: { title: "EVs per Station", gridcolor: theme.gridColor },
        yaxis: { title: "", gridcolor: theme.gridColor },
        margin: { t: 70, l: 40, r: 60 },
        height: 480,
        showlegend: false,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-gap-ranking", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 8: DC Fast Penetration % ──────────────────────────────────────────
function renderDCFastPenetration(states) {
    const theme = getPlotlyTheme();
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
            font: { size: 14, color: theme.fontColor },
        },
        xaxis: { title: "DC Fast %", gridcolor: theme.gridColor },
        yaxis: { title: "", gridcolor: theme.gridColor },
        margin: { t: 70, l: 40, r: 60 },
        height: 480,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-dcfast-pct", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 9: L2 Ports per Station ───────────────────────────────────────────
function renderL2PortsPerStation(states) {
    const theme = getPlotlyTheme();
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
            font: { size: 14, color: theme.fontColor },
        },
        xaxis: { title: "L2 Ports / Station", gridcolor: theme.gridColor },
        yaxis: { title: "", gridcolor: theme.gridColor },
        margin: { t: 70, l: 40, r: 60 },
        height: 480,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-l2-per-station", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 10: Regional Station Count ────────────────────────────────────────
function renderRegionalStations(regions) {
    const theme = getPlotlyTheme();
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
        title: { text: "Regional Station Count", font: { size: 14, color: theme.fontColor } },
        xaxis: { title: "Region", gridcolor: theme.gridColor },
        yaxis: { title: "Total Stations", gridcolor: theme.gridColor },
        showlegend: false,
        margin: { t: 50 },
        height: 400,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-regional-stations", [trace], layout, PLOTLY_CONFIG);
}

// ── Chart 11: Regional EVs per Station ──────────────────────────────────────
function renderRegionalGap(regions) {
    const theme = getPlotlyTheme();
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
        title: { text: "EVs per Station Breakdown by Region", font: { size: 14, color: theme.fontColor } },
        xaxis: { title: "Region", gridcolor: theme.gridColor },
        yaxis: { title: "EVs per Station", gridcolor: theme.gridColor },
        showlegend: false,
        margin: { t: 50 },
        height: 400,
        paper_bgcolor: theme.paper_bgcolor,
        plot_bgcolor: theme.plot_bgcolor,
        font: { color: theme.fontColor },
    };
    Plotly.newPlot("chart-regional-gap", [trace], layout, PLOTLY_CONFIG);
}

// ── State Drill-Down Modal ──────────────────────────────────────────────────
function openStateModal(stateCode) {
    const theme = getPlotlyTheme();
    const stateData = DATA.states.find(d => d.state === stateCode);
    const densityData = DATA.density.find(d => d.state === stateCode);
    const adoptionData = DATA.adoption.find(d => d.state === stateCode);
    const stateCities = DATA.cities.filter(d => d.state === stateCode);

    const stateName = densityData?.state_name || adoptionData?.state_name || stateCode;
    document.getElementById("modal-title").textContent = `${stateName} (${stateCode}) — State Detail`;

    // KPIs
    const kpisEl = document.getElementById("modal-kpis");
    const totalStations = stateData?.total_stations ?? "N/A";
    const dcFast = stateData?.stations_with_dc_fast ?? "N/A";
    const density = densityData?.stations_per_100k?.toFixed(1) ?? "N/A";
    const evsPerStation = adoptionData?.evs_per_station?.toFixed(1) ?? "N/A";
    const gapScore = adoptionData?.infrastructure_gap_score?.toFixed(1) ?? "N/A";

    kpisEl.innerHTML = [
        { label: "Total Stations", value: typeof totalStations === "number" ? totalStations.toLocaleString() : totalStations },
        { label: "DC Fast Stations", value: typeof dcFast === "number" ? dcFast.toLocaleString() : dcFast },
        { label: "Stations/100k", value: density },
        { label: "EVs per Station", value: evsPerStation },
        { label: "Gap Score", value: gapScore },
    ].map(k => `
        <div class="modal-kpi">
            <div class="modal-kpi-label">${k.label}</div>
            <div class="modal-kpi-value">${k.value}</div>
        </div>
    `).join("");

    // City bar chart
    if (stateCities.length > 0) {
        const topCities = stateCities.slice(0, 15).reverse();
        const cityTrace = {
            type: "bar",
            orientation: "h",
            x: topCities.map(d => d.total_stations),
            y: topCities.map(d => d.city),
            text: topCities.map(d => d.total_stations.toLocaleString()),
            textposition: "outside",
            marker: { color: TEAL },
        };
        const cityLayout = {
            title: { text: `Top Cities in ${stateCode}`, font: { size: 13, color: theme.fontColor } },
            xaxis: { title: "Stations", gridcolor: theme.gridColor },
            yaxis: { title: "", gridcolor: theme.gridColor },
            margin: { t: 40, l: 100, r: 50, b: 40 },
            height: 320,
            paper_bgcolor: theme.paper_bgcolor,
            plot_bgcolor: theme.plot_bgcolor,
            font: { color: theme.fontColor },
        };
        Plotly.newPlot("modal-chart-cities", [cityTrace], cityLayout, PLOTLY_CONFIG);
    } else {
        document.getElementById("modal-chart-cities").innerHTML =
            '<p class="modal-no-data">No city-level data available for this state.</p>';
    }

    // DC Fast vs L2 donut
    if (stateData) {
        const dcCount = stateData.stations_with_dc_fast || 0;
        const l2Count = (stateData.total_stations || 0) - dcCount;
        const donutTrace = {
            type: "pie",
            labels: ["L2 Only", "DC Fast"],
            values: [l2Count, dcCount],
            hole: 0.5,
            marker: { colors: [BLUE, AMBER] },
            textinfo: "label+percent",
            textfont: { color: theme.fontColor },
        };
        const donutLayout = {
            title: { text: "Charger Type Breakdown", font: { size: 13, color: theme.fontColor } },
            margin: { t: 40, l: 20, r: 20, b: 20 },
            height: 320,
            paper_bgcolor: theme.paper_bgcolor,
            font: { color: theme.fontColor },
            showlegend: true,
            legend: { font: { color: theme.fontColor } },
        };
        Plotly.newPlot("modal-chart-breakdown", [donutTrace], donutLayout, PLOTLY_CONFIG);
    } else {
        document.getElementById("modal-chart-breakdown").innerHTML =
            '<p class="modal-no-data">No breakdown data available.</p>';
    }

    // Show modal
    document.getElementById("state-modal").hidden = false;
    document.body.style.overflow = "hidden";
}

function closeStateModal() {
    document.getElementById("state-modal").hidden = true;
    document.body.style.overflow = "";
    Plotly.purge("modal-chart-cities");
    Plotly.purge("modal-chart-breakdown");
}

function initModalListeners() {
    document.getElementById("modal-close").addEventListener("click", closeStateModal);
    document.getElementById("state-modal").addEventListener("click", (e) => {
        if (e.target.id === "state-modal") closeStateModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !document.getElementById("state-modal").hidden) {
            closeStateModal();
        }
    });
}

// ── Timeline Animation ──────────────────────────────────────────────────────
function initTimelineControls() {
    const slider = document.getElementById("timeline-slider");
    const playBtn = document.getElementById("timeline-play");

    const ts = DATA.timeseries;
    const minYear = ts[0].year;
    const maxYear = ts[ts.length - 1].year;

    slider.min = minYear;
    slider.max = maxYear;
    slider.value = maxYear;

    // Initial display — show full chart
    updateTimelineReveal(maxYear);

    slider.addEventListener("input", () => {
        stopTimeline();
        const year = parseInt(slider.value);
        const snapped = findNearestYear(year, ts);
        updateTimelineReveal(snapped);
    });

    playBtn.addEventListener("click", () => {
        if (timelineInterval) {
            stopTimeline();
        } else {
            let currentYear = parseInt(slider.value);
            if (currentYear >= maxYear) currentYear = minYear;

            const yearsList = ts.map(d => d.year).filter(y => y >= currentYear);
            let idx = 0;

            playBtn.innerHTML = "&#10074;&#10074;";
            timelineInterval = setInterval(() => {
                if (idx >= yearsList.length) {
                    stopTimeline();
                    return;
                }
                updateTimelineReveal(yearsList[idx]);
                slider.value = yearsList[idx];
                idx++;
            }, 600);
        }
    });

    function stopTimeline() {
        if (timelineInterval) {
            clearInterval(timelineInterval);
            timelineInterval = null;
        }
        playBtn.innerHTML = "&#9654;";
    }

    function findNearestYear(target, data) {
        let closest = data[0].year;
        for (const d of data) {
            if (Math.abs(d.year - target) < Math.abs(closest - target)) {
                closest = d.year;
            }
        }
        return closest;
    }
}

function updateTimelineReveal(year) {
    const ts = DATA.timeseries;
    const maxTotal = ts[ts.length - 1].cumulative_l2_only + ts[ts.length - 1].cumulative_dc_fast;

    // Slice data up to selected year (progressive reveal)
    const visible = ts.filter(d => d.year <= year);
    const entry = visible[visible.length - 1];
    const total = entry.cumulative_l2_only + entry.cumulative_dc_fast;

    // Update L2 trace (index 0) and DC Fast trace (index 1)
    Plotly.restyle("chart-growth", {
        x: [visible.map(d => d.year)],
        y: [visible.map(d => d.cumulative_l2_only)],
    }, [0]);
    Plotly.restyle("chart-growth", {
        x: [visible.map(d => d.year)],
        y: [visible.map(d => d.cumulative_dc_fast)],
    }, [1]);

    // Move marker dot + annotation (trace index 2)
    Plotly.restyle("chart-growth", {
        x: [[year]],
        y: [[total]],
        text: [[total.toLocaleString()]],
    }, [2]);

    // Keep y-axis fixed to max so the scale doesn't jump, but let x-axis follow
    Plotly.relayout("chart-growth", {
        "xaxis.range": [ts[0].year - 0.5, year + 1.5],
        "yaxis.range": [0, maxTotal * 1.12],
    });

    // Update labels
    document.getElementById("timeline-year").textContent = year;
    document.getElementById("timeline-counter").textContent = `${total.toLocaleString()} stations`;

    // YoY growth badge
    const yoyEl = document.getElementById("timeline-yoy");
    const prevEntry = ts.find(d => d.year === year - 1);
    if (prevEntry) {
        const prevTotal = prevEntry.cumulative_l2_only + prevEntry.cumulative_dc_fast;
        if (prevTotal > 0) {
            const pct = ((total - prevTotal) / prevTotal * 100).toFixed(0);
            yoyEl.textContent = `+${pct}% YoY`;
            yoyEl.className = "timeline-yoy positive";
        } else {
            yoyEl.textContent = "";
            yoyEl.className = "timeline-yoy";
        }
    } else {
        yoyEl.textContent = "";
        yoyEl.className = "timeline-yoy";
    }
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    try {
        // Set theme BEFORE rendering charts
        initThemeToggle();

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

        // Filter out records with null key metrics
        const densityClean = density.filter(d => d.stations_per_100k != null);
        const adoptionClean = adoption.filter(d => d.evs_per_station != null);

        // Store globally for modal drill-downs
        DATA = { kpis, states, cities, density: densityClean, adoption: adoptionClean, regions, timeseries };

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

        // Init interactive features
        initModalListeners();
        initTimelineControls();
    } catch (err) {
        console.error("Failed to load dashboard data:", err);
        document.querySelector(".dashboard-container").innerHTML =
            '<p style="text-align:center;padding:40px;color:#ef4444;">Failed to load data. Run <code>python export_data.py</code> first, then serve via HTTP server.</p>';
    }
}

document.addEventListener("DOMContentLoaded", init);

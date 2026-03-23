# EV Dashboard Enhancement Plan: Dark Mode + State Drill-Down + Animated Timeline

## Context
The EV Charging Dashboard is a static Plotly.js site (vanilla JS, no frameworks) served from GitHub Pages. It currently has 12 charts, 3 KPI tiles, and loads data from 7 JSON files exported from Snowflake. We're adding 3 features to make it more interactive and visually impressive for a YouTube demo.

## Implementation Order
1. **Dark Mode Toggle** — establishes theming infrastructure (CSS variables) that features 2 and 3 inherit
2. **State Drill-Down Modal** — requires data pipeline change + new UI
3. **Animated Timeline Slider** — self-contained, touches only the growth chart

---

## Feature 1: Dark Mode Toggle

### Files to modify
- `web_dashboard/css/dashboard.css`
- `web_dashboard/index.html`
- `web_dashboard/js/dashboard.js`

### CSS Changes (`dashboard.css`)
- Add `:root` CSS custom properties for all hardcoded colors (body bg, card bg, text colors, borders, shadows)
- Add `[data-theme="dark"]` override block with dark palette values
- Replace every hardcoded color in existing rules with `var(--...)` references
- Add `transition: background-color 0.3s, color 0.3s` on body, cards, KPIs for smooth toggle
- Add `.theme-toggle` button styles (positioned in header, right side)
- Add sun/moon icon visibility rules: `[data-theme="dark"] .icon-sun { display:none }` etc.

### HTML Changes (`index.html`)
- Add a `<button class="theme-toggle" id="theme-toggle">` inside `.dashboard-header` with inline SVG sun/moon icons

### JS Changes (`dashboard.js`)
- Add `getPlotlyTheme()` helper → returns `{ paper_bgcolor, plot_bgcolor, fontColor, gridColor }` based on `document.documentElement.dataset.theme`
- Each existing render function: add `const theme = getPlotlyTheme()` and apply `font.color`, axis `gridcolor`, `paper_bgcolor`, `plot_bgcolor` from theme
- Add `updateChartsTheme()` → calls `Plotly.relayout()` on all 11 chart divs with theme colors (Plotly ignores CSS variables — must update via JS)
  - Special handling for choropleth: also update `geo.bgcolor`, `coloraxis.colorbar.tickfont.color`
  - Use dot-notation string keys for nested Plotly properties (e.g. `"xaxis.gridcolor"`)
- Add `initThemeToggle()`:
  - Read `localStorage.getItem("ev-dash-theme")` on load, set `data-theme` attribute BEFORE charts render
  - Toggle click handler: flip theme, save to localStorage, call `updateChartsTheme()`

### Key gotcha
- Theme must be set before `init()` renders charts so `getPlotlyTheme()` returns correct colors on first paint

---

## Feature 2: State Drill-Down Modal

### Files to modify
- `web_dashboard/export_data.py` — remove `LIMIT 25` from stations_by_city query
- `web_dashboard/data/stations_by_city.json` — regenerated (~2,800 rows, ~336KB)
- `web_dashboard/css/dashboard.css` — modal styles
- `web_dashboard/index.html` — modal HTML
- `web_dashboard/js/dashboard.js` — modal logic + choropleth click handler

### Data Pipeline Change (`export_data.py`)
- Line 42: remove `LIMIT 25` from `stations_by_city` query
- Keep flat array format (JS filter on ~2,800 rows is instant)
- Run `python export_data.py` to regenerate JSON

### HTML Changes (`index.html`)
- Add modal overlay before `</body>`:
  ```html
  <div class="modal-overlay" id="state-modal" hidden>
    <div class="modal-content">
      <button class="modal-close" id="modal-close">&times;</button>
      <h2 id="modal-title"></h2>
      <div class="modal-kpis" id="modal-kpis"></div>
      <div class="modal-charts">
        <div id="modal-chart-cities" class="modal-chart"></div>
        <div id="modal-chart-breakdown" class="modal-chart"></div>
      </div>
    </div>
  </div>
  ```

### CSS Changes (`dashboard.css`)
- `.modal-overlay`: fixed fullscreen, rgba(0,0,0,0.6), backdrop-filter: blur(4px), flex center, z-index 1000
- `.modal-content`: `var(--bg-card)` background, max-width 900px, 90vw, max-height 85vh, overflow-y auto, border-radius 16px
- `.modal-close`: absolute top-right, `var(--text-secondary)` color
- `.modal-kpis`: grid, auto-fit columns, small stat cards
- `.modal-charts`: 2-column grid, collapses to 1-col on mobile
- `.modal-overlay[hidden] { display: none }`
- Add cursor pointer hint on choropleth map card

### JS Changes (`dashboard.js`)
- Add `let DATA = {}` at top of file
- In `init()`, after fetching all data, store to `DATA`: `DATA = { kpis, states, cities, density: densityClean, adoption: adoptionClean, regions, timeseries }`
- After `renderChoropleth()`, add click handler:
  ```js
  document.getElementById("chart-choropleth").on("plotly_click", (e) => {
    openStateModal(e.points[0].location);
  });
  ```
- Implement `openStateModal(stateCode)`:
  - Look up state in `DATA.states`, `DATA.density`, `DATA.adoption`
  - Filter `DATA.cities` by state
  - Render 5 KPI tiles (total stations, DC fast, density, EVs/station, gap score)
  - Render top cities horizontal bar chart (Plotly, up to 15 cities)
  - Render DC Fast vs L2 donut chart (Plotly pie with hole=0.5)
  - Apply `getPlotlyTheme()` to modal charts
  - Show modal, set `body.style.overflow = "hidden"`
  - Handle states with no city data gracefully (show message)
- Implement `closeStateModal()`:
  - Hide modal, restore body overflow
  - `Plotly.purge()` both modal chart divs (prevent memory leaks)
- Close triggers: X button, click outside modal, Escape key

### Key gotcha
- Puerto Rico and some territories have null density/adoption data → use optional chaining + "N/A" fallback
- `plotly_click` returns `location` as state abbreviation (e.g. "CA") — matches `state` field in all datasets

---

## Feature 3: Animated Timeline Slider

### Files to modify
- `web_dashboard/index.html` — timeline controls HTML
- `web_dashboard/css/dashboard.css` — timeline control styles
- `web_dashboard/js/dashboard.js` — animation logic

### HTML Changes (`index.html`)
- Inside the growth chart card (after `#chart-growth`), add:
  ```html
  <div class="timeline-controls" id="timeline-controls">
    <button class="timeline-btn" id="timeline-play">&#9654;</button>
    <input type="range" id="timeline-slider" min="2000" max="2024" value="2024" step="1">
    <span class="timeline-year" id="timeline-year">2024</span>
    <span class="timeline-counter" id="timeline-counter"></span>
  </div>
  ```

### CSS Changes (`dashboard.css`)
- `.timeline-controls`: flex row, align-items center, gap 12px, padding 12px 8px 0
- `.timeline-btn`: 36px circle button, `var(--text-primary)` color, `var(--bg-card)` bg
- `.timeline-slider`: flex 1, accent-color #5AC8C8
- `.timeline-year`: bold, 1.1rem, min-width 3em
- `.timeline-counter`: medium weight, `var(--text-secondary)` color

### JS Changes (`dashboard.js`)
- Modify `renderGrowthOverTime()` to include:
  - A vertical dashed line shape at year 2024 (initial position)
  - A marker scatter trace (trace index 2) at the total cumulative value for 2024
- Add `updateTimelineHighlight(year)`:
  - Use `Plotly.relayout("chart-growth", {"shapes[0].x0": year, ...})` to move the vertical line
  - Use `Plotly.restyle("chart-growth", {x: [[year]], y: [[total]]}, [2])` to move the marker dot
  - Update `#timeline-year` text and `#timeline-counter` with formatted station count
- Add `initTimelineControls()`:
  - Slider `input` event → `updateTimelineHighlight(parseInt(slider.value))`
  - Play button click → start `setInterval` at 600ms/year (full animation ~15s)
  - If at year 2024, reset to 2000 before playing
  - Toggle play/pause icon (▶ / ❚❚)
  - Stop animation if slider is manually dragged
  - Handle missing years in timeseries (some years skipped) — advance to next valid year

### Key gotcha
- Timeseries data has gaps (not every year 2000-2024 exists) — build a Set of valid years and skip missing ones in the animation loop
- Use `Plotly.relayout` + `Plotly.restyle` (not `Plotly.newPlot`) for smooth performance during animation

---

## Files Modified Summary

| File | Feature(s) | Type of Change |
|------|-----------|----------------|
| `web_dashboard/css/dashboard.css` | 1, 2, 3 | CSS variables, modal styles, timeline styles |
| `web_dashboard/index.html` | 1, 2, 3 | Theme toggle button, modal HTML, timeline controls |
| `web_dashboard/js/dashboard.js` | 1, 2, 3 | Theme helpers, DATA global, modal logic, timeline animation |
| `web_dashboard/export_data.py` | 2 | Remove LIMIT 25 from city query |
| `web_dashboard/data/stations_by_city.json` | 2 | Regenerated with all ~2,800 rows |

## Verification Plan
1. `cd web_dashboard && python -m http.server 8000` → open http://localhost:8000
2. **Dark mode**: click toggle → all charts and UI switch smoothly, refresh → persists from localStorage
3. **State drill-down**: click any state on choropleth → modal opens with KPIs + city bar chart + donut chart. Click X / outside / Escape → closes. Test dark mode inside modal.
4. **Timeline**: click play button → animation runs 2000→2024 with vertical line + counter. Drag slider manually. Verify play resets when at end.
5. Copy updated files to `docs/` folder for GitHub Pages deployment

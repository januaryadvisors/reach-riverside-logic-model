# Reach Riverside — Logic Model + KPI layer (prototype)

A local, self-contained prototype that adds a **KPI / measurement layer** on top of
the existing Reach Riverside digital logic model. Everything runs from frozen local
data — no live Google Sheets calls, nothing deployed.

Deployed here: https://januaryadvisors.github.io/reach-riverside-logic-model/

## Run it

```bash
cd /Users/carlylevy/Projects/reach/kpi-prioritization
python3 -m http.server 8753
# then open http://localhost:8753/index.html
```

(A plain file:// open won't work because the app `fetch()`es local JSON — use the server.)

Deep link: `http://localhost:8753/index.html#scorecard` opens the scorecard on load.

## What the KPI layer adds

A control bar at the top with:
- **Show metrics** — toggles the whole measurement layer on/off (clean model vs. monitoring view)
- **Color by status** — adds a colored left accent to each outcome card by status
- **View** — All outcomes / Core KPIs only / Unmeasured (gaps)
- **Legend** + **View scorecard** button

On each outcome card (Short-term / Intermediate / Long-term columns):
- A **status dot** (green on-track / amber at-risk / red off-track / grey no-data)
- A **mini progress bar** (avg progress from baseline → target)
- **"⚠ No KPI yet"** marker on unmeasured outcomes (the gap-finder)
- Click a card → **per-outcome KPI modal** with baseline/current/target, source, cadence, owner, tier

The **scorecard modal** shows a coverage summary (outcomes measured, KPIs defined,
% coverage, # needing attention) and every KPI grouped by outcome column.

## How it's wired (so it's easy to change)

- `index.html` — entry point; loads the original dashboard engine, then `kpi-layer.js`
- `config.js` — `USE_LIVE_GOOGLE_SHEETS: false` → reads frozen `assets/data.json`
- `assets/kpi-layer.js` — **the KPI feature** (decoupled; decorates outcome cards
  after the dashboard renders — it does not modify dashboard internals)
- `assets/kpi.css` — KPI styles
- `assets/indicators.json` — **the KPI data**, keyed by exact outcome label.
  Sample/illustrative values, not official Reach figures. This is the file to edit
  to populate real KPIs. Fields: indicator, definition, unit (% / $ / count),
  baseline, target, current, direction (up/down), source, frequency, owner,
  tier (Core/Secondary), status (optional — derived from current vs. target if omitted).
- `assets/dashboard.js` etc. — the original Reach logic-model engine (unmodified)

## Refreshing the frozen model data

```bash
curl -sL "https://docs.google.com/spreadsheets/d/1olavg1cfmkW75MrPcuRftWsEBcfIf7mzKX7vcaNdV6E/export?format=csv&gid=1442531113" -o build/reach_model.csv
node build/build-data.js
```

`build/build-data.js` mirrors the dashboard's own CSV→JSON transform, so the frozen
data renders identically to the live site, and it prints the full outcome lists.

## Status / what's verified

Rendered headlessly (Chrome) end-to-end: logic model renders, outcome cards are
decorated with status dots + bars + gap markers, the scorecard modal and coverage
summary work. The per-outcome modal uses the same modal machinery as the scorecard.

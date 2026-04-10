# Chronocarto

**A Spatiotemporal Atlas of Human Conflict**

[Live Demo](https://0xtreme.github.io/Chronocarto/) | [Design Doc](docs/Chronocarto_Design_Doc%20(1).md)

Chronocarto is a map-first visual atlas of human conflict across recorded history. The interface is a single world map with a scrubbable timeline — no dashboards, no lists, no landing pages. Users scrub through time and watch conflicts bloom and recede across geography, revealing the persistent patterns that historians know intuitively but most people never see.

## What it shows

**2,297 conflicts** spanning 3100 BCE to 2025, drawn from:

- **527 curated conflicts** covering antiquity through present — major wars, battles, genocides, colonial violence, and insurgencies across every continent
- **1,770 UCDP events** from the Uppsala Conflict Data Program's Georeferenced Event Dataset (1989–2023), covering 124 countries

## Features

- **Heatmap + event modes** — density shading at world zoom, individual circles when zoomed in
- **Clustering** — nearby events group into numbered clusters at low zoom, expand on click
- **Timeline scrubber** — dual-thumb slider spanning 3000 BCE to 2026, with play animation
- **Density sparkline** — histogram behind the timeline showing where conflicts cluster in time
- **Search** — find any conflict by name, fly to its location
- **Filters** — by conflict type (interstate, civil, religious, insurgency, genocide, colonial, raid, succession) and minimum casualty threshold
- **Era presets** — quick jumps to Antiquity, Classical, Medieval, Early Modern, Industrial, Modern, Contemporary
- **Detail cards** — click any event to see belligerents, dates, casualties, summary, and a Wikipedia link
- **Shareable URLs** — time range and map position encoded in the URL hash
- **Mobile responsive** — works on phones and tablets

## Data sources

| Dataset | Coverage | Notes |
|---|---|---|
| UCDP/PRIO GED v24.1 | 1989–2023 | 350k raw events aggregated to 1,770 conflict-country records |
| Curated historical | 3100 BCE–2025 | 527 hand-researched conflicts from scholarly sources |

Casualty figures are always shown as ranges. Dates marked "approximate" or "disputed" reflect limited historical precision. The dataset prioritises geographic coverage over exhaustive event counts.

## Running locally

```bash
npm install
npm run serve        # serves public/ on http://localhost:4173
```

## Build pipeline

```bash
npm run fetch:data   # download UCDP GED CSV (~30 MB)
npm run build:data   # generate curated conflicts JSON
npm run merge:data   # process UCDP + merge with curated
npm run sync:pages   # copy public/ → docs/ for GitHub Pages
npm run build        # all of the above in sequence
```

## Tech stack

- **MapLibre GL JS** — open-source map rendering (no Mapbox token needed)
- **CartoDB dark basemap** — muted, label-free tiles
- **Vanilla JS** — no framework, no build step for the frontend
- **Node.js scripts** — data fetching, processing, and deployment
- **GitHub Pages** — static hosting from the `docs/` folder

## Project structure

```
Chronocarto/
├── public/              # frontend source files
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   └── data/conflicts.json
├── docs/                # GitHub Pages (synced from public/)
├── scripts/
│   ├── build-dataset.mjs       # curated conflict data
│   ├── fetch-data.mjs          # UCDP download
│   ├── process-ucdp.mjs        # UCDP CSV → aggregated JSON
│   ├── merge-datasets.mjs      # curated + UCDP → final output
│   └── sync-pages-assets.mjs   # public/ → docs/
├── data/
│   ├── raw/             # downloaded source files (.gitignored)
│   └── processed/       # intermediate processed data
└── package.json
```

## Licence

Data: UCDP data is CC BY 4.0. Curated data is original research.

Built by Praveen / Easyrun.

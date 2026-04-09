# Chronocarto

### A Spatiotemporal Atlas of Human Conflict

**Product Requirements & Technical Design Document**

Version 0.1 — Draft
Author: Praveen • Easyrun

---

## 1. Vision & Problem Statement

Chronocarto is a map-first visual atlas of human conflict across recorded history. The interface is a single world map with a scrubbable timeline; there are no dashboards, no lists, no landing pages. Users scrub through time and watch conflicts bloom and recede across geography, revealing the persistent patterns that historians know intuitively but most people never see: that violence clusters on the same ground across millennia — the Levant, the Balkans, the Hindu Kush, the Korean peninsula, the Rhine frontier.

The core insight the product makes visceral is that conflict is a property of geography as much as of people. Chokepoints, imperial frontiers, resource corridors, and religious fault lines produce recurrent violence across regime changes, religious shifts, and technological eras. Showing this visually reframes the question from "why are those people always fighting" to "what is it about that ground that keeps producing wars."

### 1.1 Problem

- Historical conflict data exists (UCDP, COW, Seshat, Brecke) but is siloed, ugly, and locked inside academic interfaces.
- Wikipedia lists are textual and non-spatial; popular atlases are static and non-scrubbable.
- No consumer-grade product lets a curious person watch 3,000 years of human conflict unfold on a map and ask "what happened here, and why does it keep happening."

### 1.2 Product Principle

The map is the product. Every feature must justify itself by what it adds to the map. If a feature would be better as a separate page, it does not ship.

---

## 2. Goals and Non-Goals

### 2.1 Goals

- Render a single interactive world map showing geocoded conflict events across a user-selected time window.
- Provide a timeline scrubber spanning antiquity to present (target: 3000 BCE — present).
- Support filtering by conflict type (interstate war, civil war, religious conflict, insurgency, genocide, raid).
- Visualise intensity via heatmap and discrete event markers, switchable by zoom level.
- Allow users to click any event to see a concise card: parties, dates, estimated casualties, type, sources.
- Ship a defensible MVP covering 1800 — present using UCDP + COW, then extend backwards.

### 2.2 Non-Goals (v1)

- User accounts, social features, comments, or UGC.
- Editorial narrative essays or long-form historiography.
- Predictive modelling of future conflict.
- Mobile-native apps (responsive web only for v1).
- Multi-language UI (English only for v1).

---

## 3. Target Users

| Persona | Needs | Success looks like |
|---|---|---|
| The curious generalist | To understand "why is that region always in the news" | Loses an hour scrubbing the timeline |
| The history student / teacher | A visual aid that contextualises a specific war or period | Uses it in a lesson or essay |
| The policy / geopolitics reader | Historical baseline for current conflicts | Cites the pattern in an argument |
| The data-curious enthusiast | A beautifully rendered dataset they can explore | Shares a screenshot of a surprising pattern |

---

## 4. Core User Experience

### 4.1 The Single Screen

The entire application is one screen. Layout:

- Full-bleed world map (dark basemap, muted land, no labels above city level).
- Bottom: horizontal timeline scrubber spanning the full date range, with a logarithmic zoom (drag to zoom into a century, a decade, a year).
- Top-left: minimal filter chips (conflict type, minimum casualty threshold, religion involved).
- Top-right: era presets (Antiquity, Classical, Medieval, Early Modern, Industrial, Modern, Contemporary) as quick jumps.
- Right edge: slide-out event detail panel, triggered by clicking a marker.

### 4.2 Two Rendering Modes

- **Heatmap mode** (zoomed out, long time windows): density shading over geography. This is where persistent conflict zones reveal themselves — the product's core "aha" moment.
- **Event mode** (zoomed in, short time windows): individual pins for distinct conflicts, sized by estimated casualties, coloured by type.

The switch between modes is automatic based on zoom level and the number of events in view.

### 4.3 Timeline Interaction

- Scrubber supports both a point-in-time cursor and a range selection (e.g., 1914–1918).
- Play button animates forward through time at user-adjustable speed.
- Keyboard: arrow keys step the cursor, space toggles play.

### 4.4 Event Detail Card

When a user clicks an event, a card slides in from the right with: canonical name, start/end dates, location, belligerents, conflict type, estimated casualty range, a 2-3 sentence neutral summary, tags (religion, resource, succession, etc.), and source attribution. No editorial framing.

---

## 5. Data Model

All historical sources are normalised into a single canonical schema — the core ETL challenge of the project.

### 5.1 Canonical Conflict Event Schema

| Field | Type | Notes |
|---|---|---|
| event_id | string (UUID) | Internal primary key |
| canonical_name | string | Human-readable (e.g., "Battle of Gaugamela") |
| aliases | string[] | Alternative names across sources |
| start_date | partial date | ISO with precision flag (year / month / day) |
| end_date | partial date | Same; nullable for ongoing |
| date_uncertainty | string | 'exact' \| 'approximate' \| 'century' \| 'disputed' |
| latitude | float | Centroid if area-based |
| longitude | float | Same |
| location_precision | string | 'point' \| 'region' \| 'country' |
| conflict_type | enum | interstate \| civil \| religious \| insurgency \| genocide \| raid \| colonial \| succession |
| parties | json | Array of actors with role (aggressor / defender / ally) |
| casualties_low | int | Nullable |
| casualties_high | int | Nullable |
| casualty_basis | string | 'contemporary' \| 'scholarly_estimate' \| 'unknown' |
| religion_tags | string[] | Involved traditions, if religious dimension |
| summary | text | 2-3 sentence neutral description |
| source_dataset | string | UCDP \| COW \| Seshat \| Brecke \| manual |
| source_refs | json | Citations with URLs where available |
| confidence | float | 0-1, based on source agreement |

### 5.2 Source Datasets

| Dataset | Coverage | Strengths | Licence |
|---|---|---|---|
| UCDP / PRIO ACD | 1946–present, geocoded | Best modern geocoding, event-level | CC BY 4.0 |
| Correlates of War | 1816–present | Interstate & civil wars, casualty estimates | Open academic |
| ACLED | 1997–present | Fine-grained modern events | Restricted; free for research |
| Brecke Conflict Catalog | 1400–present | Long tail back to late medieval | Academic |
| Seshat Databank | Deep history, world | Pre-1400 coverage | CC BY-NC |
| Wikidata SPARQL | Antiquity–present | Filling gaps for named battles | CC0 |

### 5.3 Normalisation Challenges

- Date precision varies wildly ("circa 334 BCE" vs "1 July 1916"). Schema stores precision flags, UI renders uncertainty visibly.
- Place names drift (Constantinople → Istanbul). Geocoding must resolve to stable lat/long, with historical name preserved.
- Casualty figures are contested. Store as ranges, flag basis, never a single authoritative number.
- Actor identity across time (the 'Roman Empire' spans a millennium). Use actor entities with validity periods.
- Deduplication across sources is the hardest problem. Use fuzzy matching on name + date + location, human review for ambiguous cases.

---

## 6. Technical Architecture

### 6.1 High-Level Components

- **Ingestion layer**: Python + dbt. One ingestion job per source dataset, landing raw tables in a bronze zone.
- **Normalisation layer**: dbt models transform bronze → silver (per-source canonical) → gold (merged, deduplicated master event table).
- **Serving layer**: PostgreSQL + PostGIS for spatial queries; pre-computed tile aggregates for heatmap rendering.
- **API**: FastAPI with two primary endpoints — events in bounding box + time window, and aggregated density tiles.
- **Frontend**: React + MapLibre GL JS (open-source, no Mapbox lock-in). Deck.gl for the heatmap layer. Vite build.
- **Hosting**: Cloudflare Pages (frontend), Fly.io or Railway (API + Postgres), R2 for static tile caches.

### 6.2 Data Flow

Raw source → bronze table (Postgres) → dbt silver models (one per source, canonical schema) → dbt gold model (merged master event table with deduplication + confidence scoring) → materialised tile aggregates for heatmap → API serves either individual events (zoomed in) or pre-aggregated density (zoomed out).

### 6.3 Why This Stack

- PostGIS is the right tool for spatial + temporal queries at this scale (< 1M events).
- dbt makes the messy historical normalisation traceable, testable, and re-runnable as sources improve.
- MapLibre avoids the Mapbox token tax and stays open-source.
- Pre-aggregated tiles are essential — rendering 500k raw points on a browser will die.

### 6.4 Performance Targets

- First meaningful paint < 2s on broadband.
- Timeline scrub feels continuous (≥ 30fps) with ≤ 10k events in view.
- Heatmap tile request < 150ms p95.

---

## 7. MVP Scope & Phasing

### 7.1 Phase 0 — Proof of Visual (1 weekend)

Goal: prove the scrub-through-time visual is as compelling as it sounds in the head.

- Pull UCDP GED dataset (1989–present, already geocoded).
- Static React + MapLibre page, hardcoded data, simple timeline slider.
- No backend, no ETL, no dbt — JSON file loaded into the browser.
- Outcome: decide whether to continue. If the visual isn't striking, rethink.

### 7.2 Phase 1 — MVP (4–6 weekends)

- Coverage: 1816 — present (UCDP + COW merged).
- Proper Postgres/PostGIS backend + FastAPI.
- dbt pipeline with bronze/silver/gold for the two sources.
- Heatmap + event modes with auto-switching.
- Event detail card with sources.
- Three filters: conflict type, minimum casualties, religion involved.
- Deploy to a public URL.

### 7.3 Phase 2 — Depth Extension

- Add Brecke (1400–1815) → coverage now spans six centuries.
- Introduce confidence scoring and visual uncertainty rendering.
- Era presets and keyboard shortcuts.

### 7.4 Phase 3 — Deep Time

- Seshat + Wikidata SPARQL for pre-1400 events.
- Antiquity coverage with explicit uncertainty bands.
- "Contested geographies" highlight mode — ground that appears in the top decile of conflict density across multiple eras.

---

## 8. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Deep history data too sparse/contested to render honestly | High | Expose uncertainty visually; never hide it behind smooth aggregates |
| Deterministic framing ("those people are violent") | Medium | Editorial copy frames ground, not peoples; tag conflicts by type so religious wars don't dominate the visual |
| Casualty figures become political footballs | Medium | Always show ranges, cite sources, never single numbers |
| Performance collapses at full zoom out | High | Pre-aggregated tiles; never ship raw points at continent scale |
| ACLED licence restricts reuse | Known | Treat ACLED as optional premium layer; MVP uses UCDP + COW only |
| Scope creep into narrative/editorial features | High | Enforce "the map is the product" principle ruthlessly |
| Historical place name resolution errors | Medium | Human review queue for low-confidence geocodes; confidence visible in UI |

---

## 9. Open Questions

- Should non-battle violence (pogroms, massacres of civilians outside declared wars) be first-class events or a separate layer?
- How to visually represent long-running conflicts (Hundred Years' War) without dominating the map for a century?
- Should the default time window on first load be 'all time' (overwhelming but honest) or 'last 50 years' (approachable)?
- Is there a 'contested geographies' algorithmic highlight worth computing, or does it feel gimmicky?
- Monetisation — stays free / open source, or premium tier for deep-history layers and data export?

---

## 10. Success Metrics

- Median session length > 4 minutes (indicates the scrubbing is actually engaging).
- Timeline scrub events per session > 20.
- Event detail panel opens per session > 3.
- Organic share rate (screenshot referrals + social mentions) as proxy for "aha" moments.
- Return visitor rate > 15% within 30 days.

---

## 11. Appendix — Naming

Working name: Chronocarto (chronos + carto). Alternatives to consider: Warmap, Palimpsest, Groundtruth, The Long War Atlas.

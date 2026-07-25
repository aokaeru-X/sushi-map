# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

An interactive static webpage mapping the life journey of Su Shi (蘇軾／蘇東坡, 1037–1101), a Northern Song dynasty statesman and writer. It plots the 16 places he was posted or exiled to in chronological order on a Leaflet map, with a timeline sidebar and a detail panel showing events and representative works for each location. All page text and data are in Japanese.

This is a zero-build, dependency-free static site — no package.json, no build step, no test suite, no CI.

## Running locally

```
python3 -m http.server 8000
# open http://localhost:8000
```

Or just open `index.html` directly in a browser. Map tiles are fetched live from OpenStreetMap, so an internet connection is required even though the page, data, and Leaflet library are all bundled locally.

There is no lint, build, or test command — verify changes by loading the page in a browser and clicking through the timeline/markers.

## Architecture

- `index.html` — page shell: header, sidebar (`#timeline-list`, layer checkboxes), map container (`#map`), and the detail panel (`#detail-panel`). Loads `vendor/leaflet/leaflet.js` then `js/app.js`.
- `js/app.js` — single IIFE containing all logic. On load it `fetch`es `data/sushi.json` and, for each entry, builds a numbered map marker, a polyline segment connecting it to the previous point, and a timeline `<li>`. Clicking either a marker or a timeline item calls `focusLife()`, which flies the map to that point and renders the detail panel via `renderLifeDetail()`. There are two independently toggleable `L.layerGroup()`s: `lifeLayer` (the 16 numbered life-journey markers, on by default) and `memorialLayer` (present-day memorial/historical sites, off by default).
- `data/sushi.json` — the single source of truth for content, with three arrays:
  - `life[]` — the 16 chronological life events. Each item needs `seq` (1-based, drives marker numbering and popup/timeline linkage), `title`, `era_year`/`western_year`, `location_old`/`location_modern`, `lat`/`lng`, `note`, and optional `highlights[]` and `works[]` (each work has `title`/`year`/`desc`).
  - `memorials[]` — present-day historical sites, rendered as a separate marker layer with `title`/`location_modern`/`lat`/`lng`/`desc`.
  - `unplaced_works[]` — works that can't be tied to a specific location; not currently rendered on the map, kept for reference.
- `css/style.css` — all styling, including the responsive breakpoint (`860px`) that collapses the sidebar into a slide-out drawer.
- `vendor/leaflet/` — Leaflet.js vendored locally (no CDN dependency for the JS library itself, though map tiles still come from OpenStreetMap over the network).

## Working with the data

- When adding or editing a `life[]` entry, keep `seq` values sequential and unique — they're used as object keys (`lifeMarkers[item.seq]`, `timelineItems[item.seq]`) and as the polyline's point order.
- Overlapping coordinates are auto-offset by `jitteredLatLng()` in `js/app.js` (keyed on lat/lng rounded to 3 decimals), so it's fine for two entries to share the same real-world location.
- All rendered text goes through `escapeHtml()` before being inserted into the DOM via `innerHTML`; any new fields injected into the detail panel or popups must go through it too.
- Per the README, some coordinates/dates are historically uncertain and marked as estimates directly in the data (`note` field) — preserve that convention when editing rather than presenting estimates as fact.

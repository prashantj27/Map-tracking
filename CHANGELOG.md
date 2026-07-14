# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project does not yet publish versioned releases; entries are grouped under
`[Unreleased]` until a versioning scheme is adopted.

## [Unreleased]

### Added
- Project documentation set for long-term maintenance: `CLAUDE.md` (project context + coding/workflow rules), `docs/architecture.md` (canonical up-to-date architecture reference), `docs/roadmap.md` (forward plan + known issues), and this `CHANGELOG.md`.

### Changed
- `README.md` updated to point at the new `CLAUDE.md` and `docs/` set.
- `DOCUMENTATION.md` consolidated into a pointer to `docs/architecture.md` to avoid two divergent architecture docs.

### Notes
- No application/source code changed in this documentation pass.
- A pre-existing build issue was identified (a clean install fails to resolve `react-is`, imported transitively by `recharts@3`); it is tracked in `docs/roadmap.md` and addressed separately.

---

## Baseline (current state of `main`)

The application as it stands at the start of changelog tracking:

- Interactive MapLibre map of 1,277 SAI facilities (React 19 + TypeScript 6 + Vite 8), fully client-side with data in IndexedDB (Dexie); no backend.
- Marker clustering via `supercluster`; 3D state extrusion and dark-basemap toggles.
- State choropleth tinted by SAI region with hover highlight and click-to-filter (with GeoJSON ↔ data state-name aliasing).
- Filter panel: facility search typeahead, Region/State/Discipline selects, facility-type quick chips, active-filter tags + reset.
- Statistics deck: animated count cards, gender split bar, "Top 5 Disciplines/States" and "Gender by Facility Type" charts (per-discipline aggregation).
- Per-facility popup (Overview / Disciplines / Funds & Staff) and per-state report card (facility mix, trainees + utilization, disciplines, KISCE funds by FY, staffing, top facilities).
- Single-source facility taxonomy (`lib/facilityTypes.ts`) driving pins, chips, cards, legend, and charts.
- Build-time Excel → JSON pipeline (`scripts/convert_data.js`) with a `meta.json` version stamp that drives client reseed.
- PWA via `vite-plugin-pwa` (service worker + web manifest).

# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project does not yet publish versioned releases; entries are grouped under
`[Unreleased]` until a versioning scheme is adopted.

## [Unreleased]

### Added
- **Phase-1 Sports Infrastructure Projects module.** 373 projects from the "Project mapping" Excel, each associated with a parent facility of its state (largest NCOE, else largest facility). New `📋 Project Details →` popup link → state Projects modal (total + infra breakdown + sort + cards) → per-project detail modal (Overview / Gallery / Documents / Timeline / Remarks). Gallery with placeholder + image upload (drag-drop / multiple / camera, stored by Project Code in a separate IndexedDB) and an in-platform fullscreen viewer (prev/next/zoom/pan/download/delete/close). Architecture is ready to switch to real project coordinates via a single `USE_PROJECT_COORDINATES` flag. New: `scripts/convert_projects.cjs`, `src/lib/{projects,imageStore,permissions}.ts`, `src/components/Modal.tsx`, `src/components/projects/*`.
- Facility coordinate updates from the source Excel (208 non-KIC + 795 KIC facilities set to exact coordinates + Google Maps URLs); `📋`/`🧭` Directions button in the popup. (`scripts/{build_coordinate_overrides,apply_coordinate_updates}.cjs`.)
- Map polish: pin hover box (name + type), larger NCOE pins, hovered marker raised above neighbours.
- Project documentation set for long-term maintenance: `CLAUDE.md` (project context + coding/workflow rules), `docs/architecture.md` (canonical up-to-date architecture reference), `docs/roadmap.md` (forward plan + known issues), and this `CHANGELOG.md`.

### Changed
- Sidebar now shows all 7 facility-type filter chips (RC/NCOE/STC/EXT/KIC/KISCE/AKH); STC/EXT/AKH use distinct custom marker shapes.
- Statistics Overview removed from the sidebar (`StatsDeck` deleted; Recharts no longer bundled); trainee-strength breakup moved beneath the total in the right-side state report card.
- `react-is` added as an explicit dependency so a clean `vite build` resolves it (recharts' undeclared import).

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

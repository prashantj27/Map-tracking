# Roadmap — SAI Facilities Finder

Forward-looking plan. Items are grouped by theme and roughly ordered by value. This is a living document — update it as work lands (and reflect shipped items in `CHANGELOG.md`).

Status legend: 🔴 blocking · 🟠 high value · 🟡 nice to have · ✅ done

---

## Known issues / tech debt

- ✅ **`recharts` → `react-is` build resolution** — fixed (`react-is` added as an explicit dependency). Recharts is no longer bundled at all since `StatsDeck` was removed.
- 🟡 **Lint warnings** (`npm run lint`, all non-blocking):
  - `react-hooks/exhaustive-deps` on `useMemo`s that depend on `useLiveQuery` arrays (which get a new reference each render) — intentional given Dexie live-query memoization; the codebase convention.
  - `scripts/compare.cjs` has an unused `fs` import.

## Projects module — Phase 2+

- ✅ **Dedicated PRJ GIS layer** — projects now render their own clustered markers at their own coordinates, independent of facilities (replaced the NCOE-parent stand-in). Real coordinates arrive via a future Excel update; the layer picks them up on reseed with no code change.
- ✅ **Real GPS coordinates applied** (262 projects, from Google Maps links, cross-checked against each row's Coordinates column) + **111 explicitly flagged `Without_GPS_Images`** (their existing/interim coordinate is left untouched — they still render a marker — but the flag permanently records that real GPS-verified site photos are still needed, independent of any future incidental photo upload). The source's two sheets are disjoint and cover all 373 projects. Pipeline: `scripts/build_project_gps_overrides.cjs` + `apply_project_gps_coordinates.cjs`.
- 🟡 **A non-map way to reach genuinely coordinate-less projects.** `filteredProjects` requires `hasProjectCoordinates`, so a project with *no* location at all (not the same as being `Without_GPS_Images`-flagged — today's 111 flagged projects all still have a coordinate and do render) can never get a PRJ marker; it would only be reachable by name via search, with flying/opening its popup silently no-op'ing. Not an issue for any project currently in the dataset (all 373 have a coordinate), but worth a compact list-view fallback (e.g. "Projects without any location — N") if a future data update ever introduces a project with truly no coordinate. (The state-centric `ProjectsModal` this app had before the dedicated-PRJ-layer redesign is a reasonable starting point/precedent.)
- 🟠 **Richer project data from future Excel updates** — financials, agencies, timeline, progress, status, cost, installments, documents, multiple images, remarks. The `Project` schema already reserves these fields; wire the Documents/Timeline/Remarks tabs (currently empty-state) to them as they arrive.
- 🟡 **Real permissions/RBAC** behind `src/lib/permissions.ts` (upload/delete currently open to all).
- 🟡 **Server-backed image storage** (uploads are currently per-browser IndexedDB) if central sharing is needed.
- 🟡 **Two Excel masters at repo root** (`SAI_Facilities_Master.xlsx`, `…Master 2.xlsx`); `convert_data.js` hardcodes the `" 2"` filename default. Keep one canonical master (or a `data/` folder + required CLI arg).
- 🟡 **Ad-hoc `scripts/*.cjs` inspectors** (`analyze`, `compare`, `check_sheets`, `inspect_sheets`) are throwaway utilities — consolidate or clearly mark as such.

## Features

- 🟠 **Deep-linkable filter state.** Encode active filters (region/state/discipline/type, selected facility) in the URL query so views are shareable and back/forward works.
- 🟠 **Export / print a state report card** (PDF or CSV) from `StateReportCard`.
- 🟡 **Compare mode** — select 2–3 states and view their report metrics side by side.
- 🟡 **Time dimension for KISCE funds** — trend line across financial years, not just per-FY bars.
- 🟡 **Facility-level operational status surfacing** (`Operational_Status` exists in the model but isn't shown in the UI).

## Performance

- 🟡 **Code-split the bundle.** The main chunk and `maplibre-gl` chunk both exceed 500 kB; use dynamic `import()` for Recharts / the report card, and consider Rolldown output code-splitting.
- 🟡 **Render markers as a MapLibre GeoJSON layer** (GPU `circle`/`symbol` with `cluster: true`) instead of React DOM `<Marker>` nodes, if marker counts or interactivity grow.

## PWA / installability

- 🟠 **Real PWA icons.** The manifest points only at `favicon.svg`; generate proper PNG/maskable icons (e.g. `@vite-pwa/assets-generator`) for a genuinely installable app.
- 🟡 **Offline-first data caching** review — ensure the four data JSONs + geojson are precached deliberately.

## Accessibility & responsive

- 🟠 **Mobile / responsive layout.** The fixed side panel + full-viewport map is hard to use on small screens despite being a PWA; add a responsive breakpoint / bottom-sheet panel.
- 🟡 **Accessibility pass.** Continue the work already started (aria roles on tabs/cards, associated `<label>`s): verify keyboard navigation for clusters and report-card rows, focus-visible styles, and screen-reader labeling of chart data.

## Data & tooling

- 🟡 **Move the reseed contract into `meta.json`** fully — e.g. include a content hash alongside `generatedAt` so byte-identical regenerations don't force a reseed.
- 🟡 **Automate `convert-data`** as a documented pre-build step (or CI job) when the Excel master changes, so `public/data/*.json` never drifts from the source workbook.
- 🟡 **Tests.** There is currently no automated test layer; add unit tests for `lib/facilityTypes.ts`, `lib/stateNames.ts`, and the stats/aggregation memos.

---

*Historical audit context lives in `REFINEMENTS.md`. Architecture reference: `docs/architecture.md`.*

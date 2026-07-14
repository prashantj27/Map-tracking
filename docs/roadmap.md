# Roadmap — SAI Facilities Finder

Forward-looking plan. Items are grouped by theme and roughly ordered by value. This is a living document — update it as work lands (and reflect shipped items in `CHANGELOG.md`).

Status legend: 🔴 blocking · 🟠 high value · 🟡 nice to have · ✅ done

---

## Known issues / tech debt

- 🔴 **`recharts` → `react-is` build resolution.** `recharts@3` imports `react-is` but doesn't declare it, and it's absent from the resolved `package-lock.json`, so a clean `npm ci` + `vite build` fails to resolve `react-is`. Fix: add `react-is` (matching React 19) as an explicit dependency. *(Tracked for a dedicated bug fix PR.)*
- 🟡 **Lint warnings** (`npm run lint`, all non-blocking):
  - `react-hooks/exhaustive-deps` on several `useMemo`s that depend on `useLiveQuery` arrays (`allLocations`, `allDisciplineRows`, `allFunds`, `allManpower`) which get a new reference each render. Consider memoizing the source arrays or documenting the intentional dependency.
  - `StatsDeck.tsx` Recharts tooltip `formatter` returns a JSX fragment array without a `key` (`react/jsx-key`).
  - `scripts/compare.cjs` has an unused `fs` import.
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

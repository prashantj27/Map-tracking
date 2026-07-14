# CLAUDE.md — Project context & working rules

Guidance for AI assistants (and humans) working in this repository. Treat this as a **production codebase**.

## What this project is

**SAI Facilities Finder** — an offline-capable single-page web app that maps 1,277 Sports Authority of India facilities on an interactive MapLibre map, with filtering, per-facility detail popups, per-state report cards, and live statistics. **No backend**: all data ships as static JSON and lives in the browser's IndexedDB.

- **Stack:** React 19 · TypeScript 6 · Vite 8 (Rolldown) · MapLibre GL 5 (`react-map-gl/maplibre`) · Dexie 4 (IndexedDB) · Recharts 3 · `supercluster` · `vite-plugin-pwa` · oxlint.
- **Full architecture:** see [`docs/architecture.md`](docs/architecture.md). **Roadmap & known issues:** [`docs/roadmap.md`](docs/roadmap.md). **Changelog:** [`CHANGELOG.md`](CHANGELOG.md).

## Commands

```bash
npm install         # run once per machine — native deps are platform-specific (see gotcha below)
npm run dev         # http://localhost:5173
npm run build       # tsc -b && vite build  (must pass before a task is complete)
npm run lint        # oxlint
npm run preview     # serve dist/
npm run convert-data  # regenerate public/data/*.json from the Excel master
```

- **Platform gotcha:** the toolchain uses platform-specific native binaries (rolldown, lightningcss, esbuild, oxlint) installed as optional dependencies. A `node_modules` copied between operating systems will fail with "binary not found" / unresolved-native errors — run `npm install` on each machine.
- **Windows note:** if `npm run <script>` can't find a local binary from Git Bash, run it from PowerShell (or invoke `node_modules/.bin/*` directly).

## Architecture invariants — do not break these

1. **Single source of truth for facility taxonomy.** All facility-type classification goes through `classifyFacility()` and `FACILITY_CONFIG` in [`src/lib/facilityTypes.ts`](src/lib/facilityTypes.ts). It drives pin colors/acronyms, quick filters, stat cards, the legend, chart categories, and report-card chips. Never re-implement type matching inline — extend the config/classifier instead.
2. **State-name aliasing lives in `src/lib/stateNames.ts`.** GeoJSON `STNAME_SH` and facility-data `State` differ for a few states/UTs. Always translate through `geoToDataState` / `dataToGeoStates` when crossing that boundary (choropleth, click-to-filter, 3D heights).
3. **Two-stage filtering is intentional.** `filteredLocationsForStats` (region/state/discipline) drives statistics; `filteredLocations` additionally applies the type quick filter and drives map markers. Keep them separate so count cards stay stable while a type chip is active.
4. **Data is cleaned at build time, not in the client.** Discipline typo fixes, dedupe, and column renames happen in [`scripts/convert_data.js`](scripts/convert_data.js). Keep the client thin; add data cleaning to the script, not to `db.ts`.
5. **Reseed is driven by `meta.json`.** `db.ts` compares `meta.json`'s `generatedAt` against `localStorage['db_seed_meta']`. Regenerating data (which restamps `meta.json`) is what triggers a client reseed — don't hand-bump ad-hoc version numbers.
6. **Viewport state stays inside `MapView`.** `bounds`/`zoom`/`hoveredState`/`is3D`/`theme` live in `MapView` so panning never re-renders the side panel. Don't lift them into `App`.
7. **Reactivity via Dexie `useLiveQuery` + `useMemo` chains.** There is no Redux/Context store; keep it that way unless there's a clear reason.

## Coding standards

- **Reuse existing components and utilities;** avoid duplicate logic. Check `src/components/` and `src/lib/` before adding new code.
- **TypeScript:** no `any` in new code (existing MapLibre `paint` casts are localized and eslint-disabled); prefer precise types (`MapRef`, `MapLayerMouseEvent`, typed narrowing helpers like `isNonEmptyString`).
- **Styling:** class-based CSS in `src/App.css` (not CSS-in-JS libraries). Follow the existing class-naming style; avoid re-introducing pervasive inline styles.
- **Keep changes minimal, modular, and production-safe.** Match the surrounding code's conventions, comment density, and naming.
- **No fabricated data.** Never invent facility records, counts, or values. Numbers in docs must match the actual generated JSON / source.

## Workflow rules

- **Never work directly on `main`.** For every task: pull latest, then create a branch named `feature/…`, `bug/…`, `enhancement/…`, `design/…`, `docs/…`, or `research/…`.
- Configure git email as `263138193+prashantj27@users.noreply.github.com`.
- **Before completing any task:** run `npm run build` (fix TypeScript errors), run `npm run lint` (address issues), and confirm nothing else regressed.
- **For every change, report:** files changed, summary of changes, testing performed, and any risks / breaking changes. Then open a PR.
- **Update documentation when architecture or features change:** keep `docs/architecture.md`, `docs/roadmap.md`, and `CHANGELOG.md` in sync, and update this file if an invariant changes.
- Feature/behavior testing in a live browser is done manually by the maintainer in localhost; focus automated checks on build + lint + correctness.

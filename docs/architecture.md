# Architecture — SAI Facilities Finder

An offline-capable single-page web app that maps **1,277 Sports Authority of India (SAI) facilities** across India, with filtering, per-facility detail popups, per-state report cards, and live aggregate statistics. There is **no backend** — all data ships as static JSON and is served entirely from the browser's IndexedDB.

> This is the canonical, up-to-date architecture reference. `REFINEMENTS.md` is kept as a historical audit record.

---

## 1. Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| UI framework | React 19 + TypeScript 6 | Component rendering |
| Build tool | Vite 8 (`@vitejs/plugin-react`, Rolldown) | Dev server, production bundling |
| Map engine | MapLibre GL 5 via `react-map-gl/maplibre` 8 | Interactive vector map |
| Basemap | CARTO Positron (light) / Dark Matter (dark) | Base tiles from `basemaps.cartocdn.com` |
| Clustering | `supercluster` + `use-supercluster` | Marker clustering at low zoom |
| Local database | Dexie 4 (IndexedDB) + `dexie-react-hooks` | Client-side store, reactive queries |
| Charts | Recharts 3 | Bar charts in the stats panel |
| PWA | `vite-plugin-pwa` (Workbox) | Service worker, offline support, auto-update |
| Data conversion | `xlsx` (SheetJS) in a Node script | Excel → JSON at build time |
| Linting | oxlint | Static analysis |

## 2. Data flow

```
SAI_Facilities_Master 2.xlsx           (source of truth, 4 sheets)
        │  node scripts/convert_data.js  (build-time, run manually)
        ▼
public/data/*.json                      (static JSON, served by Vite)
  ├─ sai_facilities.json    1,277 records   (sheet: Facility_Master, rows with lat/lng only)
  ├─ sai_disciplines.json   1,516 records   (sheet: Discipline_Detail)
  ├─ sai_funds.json            58 records   (sheet: KISCE_Funds)
  ├─ sai_manpower.json        322 records   (sheet: KISCE_Manpower)
  └─ meta.json                              (generatedAt version stamp + source filename)
        │  fetch() on first app load — seedDatabase() in src/db.ts
        ▼
IndexedDB ("MapDatabase", Dexie schema v5)
  tables: locations, disciplines, funds, manpower
        │  useLiveQuery() (reactive reads)
        ▼
App.tsx — filters → memoized derived data → MapView + FilterPanel + StatsDeck + StateReportCard
```

Record counts above are the actual lengths of the generated JSON files.

### Seeding & reseed logic (`src/db.ts`)
- `seedDatabase()` runs once per page load, guarded by a module-level `seedPromise` (which is reset on failure so a retry is possible).
- On load the app fetches `/data/meta.json` and reads its `generatedAt` string, comparing it to `localStorage['db_seed_meta']`:
  - **Data present and version matches** → no-op (`already-seeded`).
  - **Data present but `meta.json` is unreachable** (offline) → keep existing data, do not wipe.
  - **Otherwise** → `db.delete()`, reopen, re-fetch all four JSON files, `bulkAdd`, then store the new version stamp.
- Data is already cleaned at build time (see §5); the client only does defensive `Number()` coercion on `Latitude`/`Longitude`.
- The legacy `db_seed_version` localStorage key is removed on reseed (migration from the old integer-versioning scheme).

### Data model (`src/db.ts`)
- **Location** — one facility: `Facility_ID`, `Facility_Type`, `Facility_Name`, geography (`State`, `District`, `City`, `Address`, `Latitude`, `Longitude`), `Disciplines` (comma-separated string), trainee counts (`Trainees_Male/Female`, `Total_Trainees`, `Sanctioned_Strength`), `Parent_Region`, `Operational_Status`, contact fields, `Remarks`.
- **DisciplineDetail** — per-facility, per-sport trainee breakdown, keyed by `Facility_ID`.
- **FundDetail** — KISCE fund releases: amount, sanction/release dates, head, UC status, financial year.
- **ManpowerDetail** — KISCE staffing: staff category, designation, sanctioned vs current strength, status.
- **Project** — a Phase-1 Sports Infrastructure Project: `Project_Code` (internal id, never a UI filter), `Project_Name`, `State`, `Parent_Facility_ID`/`Parent_Facility_Name`/`Parent_Is_NCOE`, `Infra_Type`, `Status`, `Order`, `Latitude`/`Longitude` (persisted for the future coordinate switch), `Remarks`, plus reserved optional fields (financials, agencies, timeline, progress, cost, installments, documents, images) for later Excel updates. See the Projects module below.

Dexie schema (v6) indexes: `locations` on `Facility_ID, Facility_Type, State, District, Disciplines`; child tables on `Facility_ID` (+ `disciplines` also on `Discipline`); `projects` on `Project_Code, State, Parent_Facility_ID, Infra_Type`. **Uploaded project images live in a separate IndexedDB** (`ProjectImages`, `src/lib/imageStore.ts`) so a data reseed (`db.delete()`) never wipes user uploads.

### Projects module (Phase-1)
An enterprise project-monitoring layer that reuses the existing map/popups/sidebar/styling without altering them.
- **Pipeline** (`scripts/convert_projects.cjs` → `public/data/sai_projects.json`): parses the "Project mapping" Excel; recovers blank states from the `Unique Code` prefix; drops rows without a valid code; cleans mojibake; derives `Infra_Type` from the name; derives `Status` (`Cancelled` where the remark says so, else `Data Awaiting`); and associates each project with a **parent facility** — the state's largest NCOE by trainee strength, or (where the state has no NCOE) its largest facility of any type — so no project is orphaned. Bumps `meta.json` to trigger a reseed.
- **Dedicated PRJ GIS layer** (`ProjectLayer` inside `MapView`): every project renders its own premium clustered marker (violet, status-based colour via `getProjectStatusColor`) at its own coordinates — a second `useSupercluster` set, fully independent of the facility markers and toggled by the filter bar's PRJ checkbox. `Parent_Facility_*` fields remain in the data but are no longer used for display.
- **Project-centric flow**: clicking a PRJ marker opens `ProjectPopup` (name, state, district if present, status, Directions, `View Project Details →` — no facility/NCOE reference) → `ProjectDetailModal` (Overview / Financials / Timeline / Gallery / Documents / Remarks). "Show on Map" (search result / future list) flies to the PRJ marker and opens its popup.
- **Filter bar** (`MapFilterBar`, bottom-left, replaces the old left sidebar): Facility Type dropdown, State selector, PRJ layer toggle, and an intelligent search over facilities **and** projects.
- **Images**: `ProjectGallery` shows a self-contained SVG placeholder until photos are uploaded (`ImageUploader`: drag-drop / multiple / camera), stored by `Project_Code` in the separate image DB and shown via the in-platform fullscreen `ImageViewer` (prev/next/zoom/pan/download/delete). Delete is gated through `src/lib/permissions.ts`.

## 3. Component & module map

```
src/
├── main.tsx                 Entry — mounts <App/> in StrictMode
├── App.tsx                  Root: owns filter state, seeds DB, derives all memoized data,
│                            composes the panel + map + report card + status overlays
├── db.ts                    Dexie schema, TS interfaces, seeding + reseed logic
├── index.css                Global resets / base styles
├── App.css                  All component styling (class-based; imported by App.tsx)
├── components/
│   ├── MapFilterBar.tsx     Floating bottom-left filters: Facility Type, State, PRJ toggle,
│   │                        intelligent search over facilities + projects (replaces the sidebar)
│   ├── MapView.tsx          MapLibre map (memoized): state choropleth (2D fill + 3D extrusion), lazy
│   │                        district lines, clustered markers (premium glyph pins via MapPinGraphic), hover
│   │                        tooltip, popup, 3D + dark-mode toggles, legend
│   ├── FacilityPopup.tsx    FacilityPopupContent — Overview / Disciplines / Funds & Staff tabs,
│   │                        Directions + Project Details link
│   ├── StateReportCard.tsx  Full-height per-state panel: facility mix, trainees + type breakup +
│   │                        utilization, disciplines, KISCE funds by FY, staffing, top facilities
│   ├── Modal.tsx            Reusable portal modal shell (Esc/backdrop close, scroll lock, focus
│   │                        trap + restore, modal stack)
│   └── projects/            ProjectLayer (PRJ markers), ProjectPopup, ProjectDetailModal,
│                            ProjectCard, ProjectGallery, ImageUploader, ImageViewer, StatusBadge
│   (StatsDeck.tsx removed — statistics now live in StateReportCard)
└── lib/  (+ projects.ts, imageStore.ts, permissions.ts)
    ├── facilityTypes.ts     Single source of truth for facility taxonomy (classify + config)
    ├── stateNames.ts        GeoJSON ↔ facility-data state-name aliasing (both directions)
    └── disciplineIcons.ts   Discipline → emoji, "-Para" folding, junk-row filtering
```

### State ownership
- **`App.tsx`** owns all filter state: `filterRegion`, `filterState`, `filterDiscipline`, `activeQuickFilter`, plus `selectedLocation`, `reportState`, `panelOpen`, and `seedState`. All derived data (`filteredLocations`, `stats`, chart data, choropleth `match` expression, scope label) is a `useMemo` chain off the live IndexedDB queries.
- **`MapView.tsx`** owns *viewport* state (`bounds`, `zoom`, `hoveredState`, `is3D`, `theme`) locally, so panning/zooming and map-mode toggles never re-render the side panel.
- **Data reads** use `useLiveQuery` (Dexie) so the UI stays in sync with IndexedDB reactively; there is no Redux/Zustand/Context — plain React state + memoization only.

### Two-stage filtering (intentional)
- `filteredLocationsForStats` applies Region / State / Discipline → drives the **statistics** (count cards, gender bar, charts).
- `filteredLocations` additionally applies the facility-type quick filter → drives the **map markers**.
- Effect: activating a type chip narrows the pins on the map but leaves the count cards stable, so the cards keep working as toggles.

## 4. Key features

### Map (`MapView.tsx`)
- CARTO Positron/Dark-Matter basemap centered on India (initial zoom 4.0), switchable via the dark-mode toggle.
- **State choropleth** (`/india_states_simplified.geojson`): each state tinted by its SAI `Parent_Region` via a MapLibre `['match', ['get','STNAME_SH'], …]` expression (15 % fill, 45 % on hover). Region→color is an **explicit stable map** (`REGION_COLORS` in `App.tsx`) so colors don't reshuffle between data versions.
- **Hover highlight** via `setFeatureState` (`generateId` on the source) + a floating tooltip; hidden while a popup is open.
- **Click a state polygon** → sets the State filter, flies to zoom 6, and opens that state's report card.
- **District boundaries** (`/india_district_simplified.geojson`, ~2.7 MB) are mounted lazily only once `zoom ≥ 5` to avoid the download at startup, and drawn from zoom 5.5.
- **Markers**: facilities become a `supercluster` point set. Clustering activates only above ~40 points (`radius 50, maxZoom 11, minPoints 3`); below that, plain pins render. Each pin is an SVG teardrop colored by category, showing either the category acronym or the sport emoji (when a discipline filter is active, or when the facility offers exactly one sport). Clusters show a count bubble sized by share and colored by the active type filter.
- **3D mode**: swaps the fill layer for a `fill-extrusion` whose height is `sqrt(facilityCount) × 22000` per state.
- **Legend** overlay driven entirely by `FACILITY_CONFIG`, listing only the categories currently present.

### Control panel (`FilterPanel.tsx` + `StatsDeck.tsx`)
- **Search** typeahead over facility name / city / district (min 2 chars, top 8) with fly-to on select.
- **Filters**: Regional Centre select (resets State), State select (+ report-card link), facility-type quick chips (`ALL / NCOE / STC / KISCE / KIC`), Sport/Discipline select with emoji. Options are derived live from the data.
- **Active-filter tags** with per-tag clear and a "Reset all" button.
- **Statistics** (scoped to State → Region → All India; type chips don't change stats): clickable count cards with animated numbers, total trainee strength with a Male/Female bar and per-category breakdown, a "Top 5 Disciplines/States (Trainees)" horizontal bar chart, and a "Gender by Facility Type" stacked bar chart. The top chart aggregates **per-discipline** numbers from the `disciplines` table (avoiding the facility-total double-count).

### Facility popup (`FacilityPopup.tsx`)
Up to three tabs, each shown only when it has data: *Overview* (address, trainee split, contact in-charge), *Disciplines* (per-sport M/F/Total table), *Funds & Staff* (KISCE fund releases in ₹ + manpower sanctioned/current/status). Detail rows are fetched per-facility via `useLiveQuery`.

### State report card (`StateReportCard.tsx`)
A full-height side panel opened by clicking a state (map or panel link): rank among states, facility mix, trainees + seat-utilization bar (only where sanctioned strength is recorded), clickable discipline chips that list the offering facilities, KISCE funds by financial year, KISCE staffing (in-post / sanctioned / vacant), and the top 5 facilities by trainees. Every facility row flies the map to that facility and opens its popup.

### Facility taxonomy (`lib/facilityTypes.ts`)
`classifyFacility(type)` maps a raw `Facility_Type` string to one of ten `FacilityCategory` codes (`RC, NCOE, STC, EXT, KIC, KISCE, NSTC, IGMA, AKHARA, OTHER`) via an exact-match table with an ordered substring fallback (KISCE before KIC, NSTC before STC). `FACILITY_CONFIG` holds each category's label, acronym, color, and light background. This one module drives pin colors/acronyms, quick filters, stat cards, the legend, chart categories, and report-card chips — so classification can never drift between views.

### PWA
`vite-plugin-pwa` with `registerType: 'autoUpdate'` generates a service worker (precaches app shell + assets) and a web manifest ("Sports Facilities Tracker"). Icons currently reference only `favicon.svg`.

## 5. Data pipeline (`scripts/convert_data.js`)
Run manually with `npm run convert-data` (or `node scripts/convert_data.js path/to/master.xlsx`). It reads the Excel master (default `SAI_Facilities_Master 2.xlsx`), and per sheet:
- **Facility_Master → sai_facilities.json**: keeps only rows with both `Latitude` and `Longitude`; normalizes the `Disciplines` list (typo fixes such as `Kho0Kho → Kho Kho`, `K&C → Kayaking & Canoeing`, `(OSOG)` stripping, dedupe + sort); coerces lat/lng to numbers.
- **Discipline_Detail → sai_disciplines.json**: normalizes each `Discipline` name.
- **KISCE_Funds / KISCE_Manpower → sai_funds.json / sai_manpower.json**: renames the source `Facility_ID(s)` column to `Facility_ID`.
- Writes `meta.json` with `generatedAt` (ISO timestamp) + `source` filename, which drives the client reseed.

All cleaning happens here so the shipped JSON is already normalized and the client stays thin.

## 6. Build, lint, run

```bash
npm install         # required per-OS: native deps (rolldown/lightningcss/oxlint) are platform-specific
npm run dev         # http://localhost:5173
npm run build       # tsc -b && vite build → dist/
npm run lint        # oxlint
npm run preview     # serve dist/ locally
npm run convert-data  # regenerate public/data/*.json from the Excel master
```

TypeScript uses project references: `tsconfig.json` → `tsconfig.app.json` (browser) + `tsconfig.node.json` (scripts/config). `dist/` is gitignored and never committed.

> Native toolchain binaries (rolldown, lightningcss, esbuild, oxlint) are installed as **platform-specific optional dependencies**. A `node_modules` copied between OSes (e.g. macOS → Windows) will not run the build/lint tools — run `npm install` on each machine.

## 7. Repository layout

```
├── index.html                     App shell
├── vite.config.ts                 React + PWA plugin config
├── tsconfig*.json                 TS project references
├── .oxlintrc.json                 Lint rules
├── SAI_Facilities_Master*.xlsx    Source Excel workbooks (v1 and "2"; "2" is the active master)
├── public/
│   ├── data/*.json + meta.json    Generated datasets (see §2)
│   ├── india_states_simplified.geojson    State polygons
│   ├── india_district_simplified.geojson  District lines (lazy-loaded)
│   ├── favicon.svg, icons.svg
├── src/                           App source (see §3)
├── scripts/
│   ├── convert_data.js            Excel → public/data JSON (the important one)
│   └── analyze.cjs, compare.cjs, check_sheets.cjs, inspect_sheets.cjs   Ad-hoc inspection utilities
├── docs/                          architecture.md (this file), roadmap.md
├── CLAUDE.md, README.md, CHANGELOG.md, REFINEMENTS.md
```

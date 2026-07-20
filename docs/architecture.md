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
| Basemap | CARTO Positron (light) / Dark Matter (dark); Esri World Imagery + Boundaries & Places (satellite) | Street tiles from `basemaps.cartocdn.com`; satellite raster tiles from `server.arcgisonline.com` |
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
An enterprise project-monitoring layer that reuses the existing map/popups/styling without altering them.
- **Pipeline** (`scripts/convert_projects.cjs` → `public/data/sai_projects.json`): parses the "Project mapping" Excel; recovers blank states from the `Unique Code` prefix; drops rows without a valid code; cleans mojibake; derives `Infra_Type` from the name; derives `Status` (`Cancelled` where the remark says so, else `Data Awaiting`); and associates each project with a **parent facility** — the state's largest NCOE by trainee strength, or (where the state has no NCOE) its largest facility of any type — so no project is orphaned. Bumps `meta.json` to trigger a reseed.
- **GPS coordinate overlay** (`scripts/build_project_gps_overrides.cjs` + `apply_project_gps_coordinates.cjs`, same two-stage provenance pattern as the facility coordinate overlay, and equally surgical — an override object only carries the fields it means to change): reads an external coordinates workbook ("Project coordinates final.xlsx") whose two sheets are **disjoint and together cover every project**. Sheet "Projects With Image Coordinates" (currently **262** matched projects) → each row's Google Maps Link is parsed for the exact `Latitude`/`Longitude` (cross-checked against the row's own Coordinates column — the script aborts on any disagreement), and the override sets `Google_Maps_URL` + `Without_GPS_Images: false`. Sheet "Projects Without Coordinates" (currently **111** projects) → the override carries **no coordinate fields at all** — whatever location the project already has (e.g. an earlier interim/approximate one) is left completely untouched — and only sets `Without_GPS_Images: true`, a permanent record that real GPS-verified site photos are still needed. The script aborts if the two sheets overlap; codes not present in `sai_projects.json` are reported (never fabricated) and any project covered by neither sheet is reported and left untouched.
- **Dedicated PRJ GIS layer** (`ProjectLayer` inside `MapView`): every project **with coordinates** renders its own premium clustered marker (status-based colour via `getProjectStatusColor`) at its own coordinates — a second `useSupercluster` set, fully independent of the facility markers, shown whenever the unified type selection is "All Facilities" or "Projects" (see below). `filteredProjects` in `App.tsx` filters to `hasProjectCoordinates` before anything else reaches the map, so a project with genuinely no coordinate (not the same thing as being `Without_GPS_Images`-flagged — a flagged project can still have an interim location) structurally cannot get a marker; it stays reachable by name via search, but flying/opening its popup is a no-op until a real coordinate exists. `Parent_Facility_*` fields remain in the data but are no longer used for display.
- **Project-centric flow**: clicking a PRJ marker opens `ProjectPopup` (name, state, district if present, status, Directions, `View Project Details →` — no facility/NCOE reference) → `ProjectDetailModal` (Overview / Financials / Timeline / Gallery / Documents / Remarks). "Show on Map" (search result / future list) switches the type selector to Projects, flies to the PRJ marker and opens its popup.
- **Project Status filter**: a status-chip row (`In Progress` / `Completed` / `Cancelled` / `Without GPS Images`) that appears only while the type selector is set to Projects. "Without GPS Images" (`projectMatchesStatusFilter` in `lib/projects.ts`) matches a project that either is **explicitly flagged** `Without_GPS_Images: true` by the source data (sticky — sourced from the GPS coordinate overlay above, independent of whatever coordinate the project carries) or has **zero uploaded gallery photos** (`projectCodesWithImages()` in `lib/imageStore.ts` — an index-only query, no blobs loaded) — either gap means it isn't yet documented on the ground. A flagged project stays in this filter even after gaining an uploaded photo, since the flag records a real, separate fact.
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
│   ├── MapFilterBar.tsx     Single floating glassmorphism panel (default: bottom-left,
│   │                        user-draggable): search (with the satellite-view toggle in the search
│   │                        box), the State selector, the Facility Type quick chips (MapQuickChips,
│   │                        nested — the sole type control), and the Project Status chip row
│   │                        (Projects only). Replaces the old left sidebar.
│   ├── MapQuickChips.tsx    Facility Type quick-chip row, nested inside MapFilterBar's panel (not
│   │                        independently positioned): All/NCOE/STC/KIC/RC/Projects primary,
│   │                        KISCE/EXT/AKH/IGMA/NSTC behind "More Filters"; wraps onto multiple
│   │                        lines. Each chip's hover tooltip carries the full type name.
│   ├── DragHandle.tsx       Grip button (in the search box) for the filter panel
│   ├── TypeIcon.tsx         Small circular badge icon for a facility type / "All" / Projects —
│   │                        reuses MapPinGraphic's glyphs so it doubles as the legend
│   ├── MapPinGraphic.tsx    Shared teardrop pin frame + per-type glyph set (also used by TypeIcon)
│   ├── MapView.tsx          MapLibre map (memoized): state choropleth (2D fill + 3D extrusion), lazy
│   │                        district lines, clustered markers, hover tooltip, popup, 3D + dark-mode
│   │                        toggles, and the Esri satellite style (dark toggle hidden while
│   │                        satellite is active). No static legend — marker colours/icons match the
│   │                        Facility Type quick chips.
│   ├── FacilityPopup.tsx    FacilityPopupContent — Overview / Disciplines / Funds & Staff tabs,
│   │                        Directions link
│   ├── StateReportCard.tsx  Full-height per-state panel: facility mix, trainees + type breakup +
│   │                        utilization, disciplines, KISCE funds by FY, staffing, top facilities
│   ├── Modal.tsx            Reusable portal modal shell (Esc/backdrop close, scroll lock, focus
│   │                        trap + restore, modal stack)
│   └── projects/            ProjectLayer (PRJ markers), ProjectPopup, ProjectDetailModal,
│                            ProjectCard, ProjectGallery, ImageUploader, ImageViewer, StatusBadge
│   (FilterPanel.tsx / StatsDeck.tsx / ProjectsModal.tsx removed — superseded by the above)
└── lib/  (+ projects.ts, imageStore.ts, permissions.ts)
    ├── facilityTypes.ts     Single source of truth for facility taxonomy (classify + config)
    ├── stateNames.ts        GeoJSON ↔ facility-data state-name aliasing (both directions)
    ├── disciplineIcons.ts   Discipline → emoji, "-Para" folding, junk-row filtering
    └── useDraggable.ts      Pointer-events drag hook (clamped, localStorage-persisted position)
```

### State ownership
- **`App.tsx`** owns `typeSelection` (`FacilityCategory | 'PRJ' | null` — the value driving the Facility Type quick chips; `null` = "All Facilities"), `filterState` (State), `projectStatusFilter`, plus `selectedLocation`/`selectedProject`, `reportState`, `projectDetail`, and `seedState`. `activeFacilityType`/`showFacilities`/`showProjects` are derived from `typeSelection` (see below). All derived data (`filteredLocations`, `filteredProjects`, choropleth `match` expression) is a `useMemo` chain off the live IndexedDB queries.
- **`MapView.tsx`** owns *viewport* state (`bounds`, `zoom`, `hoveredState`, `is3D`, `theme`) locally, so panning/zooming and map-mode toggles never re-render the filter panel. Exceptions, both driving controls in `MapFilterBar`'s search box: the `satellite` basemap toggle lives in `App.tsx` (a rare discrete toggle), and `mapZoomedIn` (drives the "zoom to full map" button) is lifted to `App` as a *boolean that flips only on threshold crossings* — MapView keeps the continuous `zoom` and reports crossings via `onZoomedInChange`, so panning within a zoom band still never re-renders the panel.
- **Data reads** use `useLiveQuery` (Dexie) so the UI stays in sync with IndexedDB reactively; there is no Redux/Zustand/Context — plain React state + memoization only.

### Type selection drives both GIS layers (intentional)
Selecting a facility category or "Projects" gives a Google-Maps-style focused single-layer view (that category's facility pins only, or the PRJ layer only); "All Facilities" shows both layers together. Concretely, `typeSelection` derives:
- `activeFacilityType` — the specific category, or `null` for "All"/"Projects" (facilities unfiltered by type).
- `showFacilities` — `false` only when `typeSelection === 'PRJ'`.
- `showProjects` — `true` for `null` ("All") and `'PRJ'`; `false` for any specific facility category.
The State selector is orthogonal (geographic) and scopes both layers together regardless of `typeSelection`.

## 4. Key features

### Map (`MapView.tsx`)
- CARTO Positron/Dark-Matter basemap centered on India (initial zoom 4.0), switchable via the dark-mode toggle.
- **Satellite basemap** (toggle in the filter panel's search box): Esri World Imagery raster tiles + Esri's World Boundaries & Places raster overlay so place names stay readable (hybrid view). No API key; the required Esri attribution is declared on the source and surfaced by MapLibre's attribution control. Tiles are fetched per-viewport, so an India-centred session only downloads India imagery, always current from the provider. While satellite is active the choropleth tint drops to a whisper (5 %/30 % hover) and **fades out entirely between zoom 6→7** (`SAT_CHOROPLETH_FADE_START/END` — once the user zooms in to inspect imagery the overlay is gone, and it returns on zoom-out; past the fade the invisible state layer also stops intercepting hover/click). State/district lines turn white for contrast, and the light/dark toggle is hidden (it only switches the CARTO street styles). (OSM publishes no satellite imagery — Esri World Imagery is the standard free companion layer for OSM-based maps.)
- **State choropleth** (`/india_states_simplified.geojson`): each state tinted by its SAI `Parent_Region` via a MapLibre `['match', ['get','STNAME_SH'], …]` expression (15 % fill, 45 % on hover). Region→color is an **explicit stable map** (`REGION_COLORS` in `App.tsx`) so colors don't reshuffle between data versions.
- **Hover highlight** via `setFeatureState` (`generateId` on the source) + a floating tooltip; hidden while a popup is open.
- **Click a state polygon** → sets the State filter, flies to zoom 6, and opens that state's report card.
- **District boundaries** (`/india_district_simplified.geojson`, ~2.7 MB) are mounted lazily only once `zoom ≥ 5` to avoid the download at startup, and drawn from zoom 5.5.
- **Markers**: facilities become a `supercluster` point set. Clustering activates only above ~40 points (`radius 50, maxZoom 11, minPoints 3`); below that, plain pins render. Each pin renders `MapPinGraphic` — a shared teardrop frame with a white per-type glyph (building/trophy/runner/columns/institution+star/handshake/crane) — **except KIC**, which keeps its original look: the facility's own sport emoji when it offers exactly one discipline, else the "KIC" acronym. Clusters show a count bubble sized by share and colored by the active type filter.
- **3D mode**: swaps the fill layer for a `fill-extrusion` whose height is `sqrt(facilityCount) × 22000` per state.
- **No static legend overlay** — marker colours/icons are driven by the same `FACILITY_CONFIG` that renders the Facility Type quick chips (`TypeIcon`), so those double as the legend.

### Floating filter panel (`MapFilterBar.tsx` + `MapQuickChips.tsx`)
A single widget, panel order top-to-bottom: **Search** → **State** → **Facility Type chips** → **Project Status** (conditional).
- **Search** typeahead over facility name/city/district and project name/state/district (min 2 chars, top 6 each, tagged `PRJ`) with fly-to + popup-open on select; results drop upward since the panel is bottom-anchored. The search box also hosts the **satellite-view toggle** (satellite icon, before the drag handle) — see the Map section above.
- **Zoom to full map**: a fit-to-extent button appears in the search row *only* once the map is zoomed in past the overview (`ZOOM_TO_MAP_MIN_ZOOM = 6` in `MapView.tsx`); the search field shrinks to make room and expands back when it hides. Clicking it flies to the all-India `INITIAL_VIEW`. MapView notifies App only on threshold *crossings* (`onZoomedInChange`), never on every zoom delta, so continuous panning still doesn't re-render the panel (invariant #6 preserved).
- **State selector**: compact, scopes both GIS layers geographically.
- **Facility Type quick chips** (`MapQuickChips.tsx`, nested — the sole type control): one-tap pills — primary `All/NCOE/STC/KIC/RC/Projects`, with `KISCE/EXT/AKH/IGMA/NSTC` behind a "More Filters" expander — write the shared `typeSelection` state directly. Each chip shows an icon + short acronym, with the full type name as a hover `title` tooltip. Wraps onto multiple lines inside the panel rather than scrolling.
- **Project Status filter**: shown only when the active type is "Projects" — see the Projects module section above.
- **Draggable**: one grip handle (`DragHandle.tsx`, in the search box) drags the whole panel — search, State, chips, and Project Status all move together (`lib/useDraggable.ts`); position is clamped to stay fully visible and persisted per-browser in `localStorage`. Double-click the handle to reset to the default bottom-left spot.

### Facility popup (`FacilityPopup.tsx`)
Up to three tabs, each shown only when it has data: *Overview* (address, trainee split, contact in-charge), *Disciplines* (per-sport M/F/Total table), *Funds & Staff* (KISCE fund releases in ₹ + manpower sanctioned/current/status). Detail rows are fetched per-facility via `useLiveQuery`. The Overview tab's action row pairs **Directions** (Google Maps) with **Birdeye** — close the popup and fly the map straight down to the facility at zoom 17 (`BIRDEYE_ZOOM` in `MapView.tsx`), most useful on the satellite basemap.

### State report card (`StateReportCard.tsx`)
A full-height side panel opened by clicking a state (map or panel link): an overview line (rank among states, **facility and project counts**), facility mix, trainees + seat-utilization bar (only where sanctioned strength is recorded), clickable discipline chips that list the offering facilities, KISCE funds by financial year, KISCE staffing (in-post / sanctioned / vacant), the top 5 facilities by trainees, and — at the end — a **Projects** section listing every project in the state (matched by `State`). Every facility row flies the map to that facility and opens its popup; every project row closes the report and flies to that project in **birdeye view** (Projects layer shown, aerial close-up at `BIRDEYE_ZOOM`).

### Facility taxonomy (`lib/facilityTypes.ts`)
`classifyFacility(type)` maps a raw `Facility_Type` string to one of ten `FacilityCategory` codes (`RC, NCOE, STC, EXT, KIC, KISCE, NSTC, IGMA, AKHARA, OTHER`) via an exact-match table with an ordered substring fallback (KISCE before KIC, NSTC before STC). `FACILITY_CONFIG` holds each category's label, acronym, color, and light background. This one module drives pin colors/icons, the Facility Type quick chips, and report-card chips — so classification and colour can never drift between views (this doubles as the map legend).

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

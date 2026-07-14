# SAI Facilities Finder — Project Documentation

An offline-capable, single-page web application that maps **1,277 Sports Authority of India (SAI) facilities** across India on an interactive map, with filtering, per-facility detail popups, and live aggregate statistics.

Dev server: `npm run dev` → http://localhost:5173

---

## 1. Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| UI framework | React 19 + TypeScript 6 | Component rendering |
| Build tool | Vite 8 (+ `@vitejs/plugin-react`) | Dev server, bundling |
| Map engine | MapLibre GL 5 via `react-map-gl/maplibre` 8 | Interactive vector map |
| Basemap | CARTO Positron (`basemaps.cartocdn.com`) | Light-theme base tiles |
| Local database | Dexie 4 (IndexedDB) + `dexie-react-hooks` | Client-side relational store, reactive queries |
| Charts | Recharts 3 | Bar charts in the stats panel |
| PWA | `vite-plugin-pwa` (Workbox) | Service worker, offline support, auto-update |
| Data conversion | `xlsx` (SheetJS) in Node scripts | Excel → JSON at build time |
| Linting | oxlint | Static analysis |

There is **no backend** — all data ships as static JSON and lives in the browser's IndexedDB.

## 2. Architecture & Data Flow

```
SAI_Facilities_Master 2.xlsx          (source of truth, 4 sheets)
        │  node scripts/convert_data.js
        ▼
public/data/*.json                    (static JSON, served by Vite)
  ├─ sai_facilities.json   1,277 records   (sheet: Facility_Master, rows with lat/lng only)
  ├─ sai_disciplines.json  1,516 records   (sheet: Discipline_Detail)
  ├─ sai_funds.json           58 records   (sheet: KISCE_Funds)
  └─ sai_manpower.json       322 records   (sheet: KISCE_Manpower)
        │  fetch() on first app load — seedDatabase() in src/db.ts
        ▼
IndexedDB ("MapDatabase", Dexie schema v5)
  tables: locations, disciplines, funds, manpower
        │  useLiveQuery() (reactive reads)
        ▼
App.tsx — filters → memoized derived data → map markers + stats + charts
```

### Seeding logic (`src/db.ts`)
- `seedDatabase()` runs once per page load (guarded by a module-level `seedPromise`).
- Reseed is triggered when: table is empty, row count > 2,000 (duplicate detection), or `localStorage.db_seed_version` < `FORCE_RESEED_VERSION` (currently `4`). On trigger the whole DB is deleted and re-fetched.
- During seeding: `Disciplines` strings are normalized (typo fixes such as `Kho0Kho → Kho Kho`, `K&C → Kayaking & Canoeing`, dedupe + sort), lat/lng coerced to numbers, and the `Facility_ID(s)` column in funds/manpower renamed to `Facility_ID`.

### Data model (`src/db.ts`)
- **Location** — one facility: `Facility_ID`, `Facility_Type`, `Facility_Name`, geography (`State`, `District`, `City`, `Address`, `Latitude`, `Longitude`), `Disciplines` (comma-separated string), trainee counts (`Trainees_Male/Female`, `Total_Trainees`, `Sanctioned_Strength`), `Parent_Region`, contact fields, `Remarks`.
- **DisciplineDetail** — per-facility, per-sport trainee breakdown (keyed by `Facility_ID`).
- **FundDetail** — KISCE fund releases: amount, sanction/release dates, head, UC status, financial year.
- **ManpowerDetail** — KISCE staffing: designation, sanctioned vs current strength, status.

Indexes: `locations` on `Facility_ID, Facility_Type, State, District, Disciplines`; child tables on `Facility_ID`.

## 3. Features

### Map (right pane)
- CARTO Positron basemap centered on India (initial zoom 4.0), navigation control top-right.
- **State choropleth** (`/india_states_simplified.geojson`, ~140 KB): each state tinted by its SAI `Parent_Region` using a MapLibre `match` expression (15% opacity fill + blue borders).
- **District boundaries** (`/india_district_simplified.geojson`, ~2.7 MB): faint black lines, visible at zoom ≥ 5.5.
- **Facility markers**: every filtered facility is an individual SVG pin, color- and acronym-coded by type:

  | Type | Acronym | Color |
  |---|---|---|
  | Regional Centre | RC | blue `#1a73e8` |
  | STC (incl. NSTC) | STC | green `#34a853` |
  | NCOE | NCOE | red `#ea4335` |
  | Extension Centre | EXT | yellow `#fbbc04` |
  | KIC | KIC | purple `#8e24aa` |
  | KISCE | KISCE | cyan `#00acc1` |
  | Other | O | grey `#9e9e9e` |

- **State hover tooltip**: shows the state name and "Click to filter state".
- **Click a state polygon** → sets the State filter and flies to zoom 6.
- **Click a marker** → detail popup with up to three tabs:
  - *Overview*: address, trainee totals with M/F split, contact in-charge.
  - *Disciplines*: table of sport-wise Male/Female/Total (shown only if the facility has rows in `disciplines`).
  - *Funds & Staff*: KISCE fund releases (₹, FY, head, UC status) and manpower (sanctioned vs current, vacancy status) — shown only when such rows exist.

### Control panel (left, 320 px)
- **Filters**: Regional Centre dropdown (resets State), State dropdown, facility-type quick chips (ALL / NCOE / STC / KISCE / KIC), Sport/Discipline dropdown. Dropdown options are derived from the live data.
- **Statistics Overview** (scoped to State → Region → All; type chips do *not* change stats):
  - Clickable count cards for NCOE / STC / KISCE / KIC (click toggles that quick filter).
  - Total trainee strength with a Male/Female proportion bar.
  - *Top 5 Disciplines (Trainees)* horizontal bar chart.
  - *Gender by Facility Type* stacked bar chart.

### PWA
`vite-plugin-pwa` with `registerType: 'autoUpdate'` generates a service worker (precaches the app shell and assets) and a web manifest ("Sports Facilities Tracker").

## 4. Repository Map

```
├── index.html                     App shell (title, #root, favicon ref)
├── vite.config.ts                 React + PWA plugin config
├── tsconfig*.json                 TS project references (app / node)
├── .oxlintrc.json                 Lint rules
├── SAI_Facilities_Master*.xlsx    Source Excel workbooks (v1 and "2")
├── public/
│   ├── data/*.json                Generated datasets (see §2)
│   ├── india_states_simplified.geojson    State polygons (used)
│   ├── india_district_simplified.geojson  District lines (used)
│   ├── india_states.geojson       Full-res states (NOT referenced by app)
│   └── favicon.svg, icons.svg
├── src/
│   ├── main.tsx                   Entry — mounts <App/> in StrictMode
│   ├── App.tsx                    Entire UI (604 lines): map, panel, popup, stats
│   ├── db.ts                      Dexie schema, interfaces, seeding + normalization
│   ├── index.css                  Global styles + MapLibre popup overrides
│   ├── App.css                    ⚠ Vite template leftover — not imported anywhere
│   └── assets/                    ⚠ hero.png / react.svg / vite.svg — unused
├── scripts/
│   ├── convert_data.js            Excel → public/data JSON (the important one)
│   ├── analyze.cjs, compare.cjs, check_sheets.cjs, inspect_sheets.cjs   Ad-hoc inspection utilities
└── dist/                          Committed build output
```

## 5. Workflows

**Run locally**
```bash
npm install
npm run dev        # http://localhost:5173
```

**Update the data** (after editing the Excel master)
```bash
node scripts/convert_data.js   # reads "SAI_Facilities_Master 2.xlsx" (filename hardcoded)
# then bump FORCE_RESEED_VERSION in src/db.ts so existing browsers re-seed
```

**Build / lint**
```bash
npm run build      # tsc -b && vite build → dist/
npm run lint       # oxlint
npm run preview    # serve dist locally
```

## 6. Key Implementation Notes

- **Reactivity**: `useLiveQuery(() => db.locations.toArray())` keeps `allLocations` in sync with IndexedDB; all derived data (`filteredLocations`, `stats`, chart data, choropleth expression) is `useMemo`-chained off it.
- **Two-stage filtering**: `filteredLocationsForStats` applies Region/State/Discipline (drives statistics); `filteredLocations` additionally applies the facility-type quick filter (drives markers). So the count cards stay stable while a type chip is active — intentional.
- **Facility-type classification is string-matching** on `Facility_Type` (`includes('ncoe')`, `includes('stc') && !includes('nstc')`, KIC vs KISCE disambiguation). The same logic is re-implemented in four places (pin color, pin acronym, quick filter, stats counting) — see refinements report.
- **Choropleth**: region → color palette assigned by alphabetical index; state → its first-seen facility's region color; built into a `['match', ['get','STNAME_SH'], ...]` expression.
- **Viewport state** (`bounds`, `zoom`) is captured on every map move for clustering, but clustering is not currently wired up (supercluster is installed yet unused).

---

*See `REFINEMENTS.md` for the full audit findings: bugs, performance issues, refactoring plan, and UI/UX recommendations from live testing.*

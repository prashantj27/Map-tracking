# SAI Facilities Finder — Audit Findings & Refinement Plan

> **STATUS: IMPLEMENTED (2026-07-13).** All items below were implemented and verified live in Chrome: A1–A8, B1–B4, C1–C7, D1–D10. The app now uses clustering (`use-supercluster`), a component architecture (`src/components/`, `src/lib/`), class-based CSS, build-time data cleaning with `meta.json` reseed versioning, facility search, a map legend, filter tags/reset, loading/error/empty states, and working state hover-highlight + click-to-filter (with name aliasing). Run `npm install` once to sync `node_modules` with the cleaned `package.json`. This document is kept as the audit record.

Based on a full code audit plus live testing at http://localhost:5173 (Chrome). Ordered by priority within each section.

---

## A. Bugs & Correctness Issues

### A1. State-name mismatch breaks click-to-filter and choropleth for some states 🔴
The GeoJSON `STNAME_SH` values don't all match `Location.State` values:

| GeoJSON | Facility data |
|---|---|
| `Andaman & Nicobar` | `Andaman & Nicobar Islands` |
| `Dadra & Nagar Haveli` + `Daman & Diu` (two features) | `Dadra & Nagar Haveli and Daman & Diu` (one value) |

Clicking those states sets a filter that matches **zero facilities** (map silently empties), and the choropleth `match` expression leaves them grey. **Fix:** a small alias map applied in both directions (or normalize the data at conversion time).

### A2. Hover highlight is dead code 🔴
`state-fills` paint uses `['feature-state','hover']`, but `setFeatureState` is never called, so the 0.5-opacity hover highlight can never activate. Either wire up `onMouseMove`/`onMouseLeave` to set feature state (requires `generateId: true` or feature ids), or drop the expression.

### A3. "Top 5 Disciplines" chart double-counts trainees 🔴
In `stats.sportsMap`, the facility's **total** M/F counts are added to *every* discipline that facility offers (a 500-trainee, 10-sport NCOE contributes 500 to each of the 10 sports). The accurate per-discipline numbers already exist in the `disciplines` table — aggregate from `db.disciplines` (joined to the filtered facility IDs) instead.

### A4. Inconsistent facility-type taxonomy (NSTC) 🟠
The quick filter and stats counting exclude `nstc` from STC, but `getPinColor`/`getFacilityAcronym` include it — an NSTC pin renders green with label "STC" yet is counted under "others" and excluded when the STC chip is active. One classification function should drive all four uses (see C4).

### A5. Broken favicon reference 🟠
`index.html` points to `/vite.svg`, which doesn't exist in `public/` → 404 on every load. `public/favicon.svg` exists; update the link.

### A6. PWA manifest is effectively empty 🟠
`manifest.icons: []` and `includeAssets` lists `favicon.ico`, `apple-touch-icon.png`, `mask-icon.svg` — none of which exist. The PWA is not installable in a meaningful way. Generate real icons (e.g. `@vite-pwa/assets-generator`) or remove the plugin until needed.

### A7. Fragile reseed versioning 🟡
`FORCE_RESEED_VERSION = 4` (localStorage) and the Dexie schema `version(5)` are two unrelated numbers that must both be bumped by hand; the `count > 2000` duplicate heuristic is arbitrary. Consider embedding a `generatedAt`/hash field in the JSON (written by `convert_data.js`) and reseeding when it changes. Also, the first-load console message "Detected duplicated, outdated, or corrupted data" is misleading for a brand-new user.

### A8. Seed failure edge cases 🟡
If `db.delete()` fails, seeding continues into `bulkAdd` against a possibly-populated DB. And a fetch failure leaves the app with an empty map and **no user-visible error** (console only). Add an error state in the UI (A11 below is related).

## B. Performance

### B1. No marker clustering — the headline issue 🔴
All 1,277 facilities render as individual React `<Marker>` DOM nodes. Observed live: the country view is a solid wall of overlapping pins (purple KIC = 1,066 of 1,277 dominates everything). Consequences:
- Map is unreadable at zoom < ~7.
- State polygons are nearly unclickable — in testing, three attempts to click a state each hit a marker instead, so click-to-filter is practically unreachable.
- 1,277 DOM nodes re-render on every filter change.

`supercluster`, `use-supercluster`, and `@types/supercluster` are **already installed**, and `bounds`/`zoom` state is already tracked — the wiring was clearly planned but never done. Options:
1. Wire up `use-supercluster` (deps already present), or
2. Render facilities as a MapLibre GeoJSON `circle`/`symbol` layer with `cluster: true` — fastest option, GPU-rendered, no DOM nodes.

### B2. Full app re-render on every map move 🟠
`onMove` calls `setBounds` + `setZoom` per frame → re-renders the entire `App` (all 1,277 markers plus two Recharts charts) continuously while panning. Currently `bounds`/`zoom` aren't even used. Remove them until clustering needs them, and then isolate them in the marker-layer component so panning doesn't re-render the side panel.

### B3. Heavy static payloads 🟡
- `india_district_simplified.geojson` (2.7 MB) is fetched on load even though the layer is invisible below zoom 5.5 — lazy-add the source on first zoom past ~5.
- `public/india_states.geojson` (2.2 MB) is **unused** by the app but is copied into every build (it's in `dist/`). Delete or move out of `public/`.

### B4. Misplaced dependencies 🟡
Runtime `dependencies` that should be dev or removed entirely: `xlsx` (used only by Node scripts → devDependencies), `@types/supercluster` (types → dev). Unused everywhere: `mappls-web-maps`, `uuid`, `@types/uuid`, `lucide-react` (and `supercluster`/`use-supercluster` until B1 is done).

## C. Code Quality & Refactoring

### C1. Decompose App.tsx (604 lines, one component)
Suggested split, no behavior change:
```
src/
├── components/
│   ├── FilterPanel.tsx      (dropdowns + chips)
│   ├── StatsDeck.tsx        (cards, gender bar, charts)
│   ├── FacilityPopup.tsx    (exists as FacilityPopupContent — move out)
│   ├── FacilityMarkers.tsx  (marker/cluster layer)
│   └── StateChoropleth.tsx  (Source/Layer pair + hover tooltip)
├── hooks/useFacilityFilters.ts   (filter state + derived memos)
├── lib/facilityTypes.ts          (see C4)
└── lib/stats.ts                  (aggregation logic)
```

### C2. Replace pervasive inline styles
Every element uses `style={{...}}` (repeated dropdown/tab/card styles). Move to CSS modules or plain classes in `App.css` — which currently exists but is an **unimported Vite-template leftover**. Delete its template content either way; also delete unused `src/assets/hero.png`, `react.svg`, `vite.svg`.

### C3. Fix TypeScript hygiene
- `// @ts-ignore` on the `react-map-gl/maplibre` import — resolve properly (import types from `react-map-gl/maplibre`; v8 ships types).
- `useRef<any>`, `(e: any)` handlers → `MapRef`, `MapLayerMouseEvent`, `MarkerEvent`.
- `uniqueRegions`/`uniqueStates` need `as string` casts everywhere because of `.filter(Boolean)` — use a typed helper (`filter((x): x is string => !!x)`).

### C4. Single source of truth for facility taxonomy
Classification-by-substring is duplicated in `getPinColor`, `getFacilityAcronym`, the quick-filter memo, and the stats loop — with inconsistencies (A4). Replace with one `classifyFacility(type: string): FacilityCategory` plus a config record `{category: {label, acronym, color, chipColor}}` that drives pins, chips, cards, filters, and stats. This also removes the hardcoded 4-entry `facilityGenderMap`.

### C5. Stable region colors
Region → color is assigned by alphabetical index into a palette, so adding/removing one region reshuffles every state's color between data versions. Define an explicit region→color map.

### C6. Move data cleaning to build time
`normalizeDisciplines()` (typo fixes like `Kho0Kho`) runs in the browser at seed time. Do it once in `scripts/convert_data.js` so the shipped JSON is already clean and the client shrinks.

### C7. Repo hygiene
- Two Excel masters at root (`SAI_Facilities_Master.xlsx`, `…Master 2.xlsx`); `convert_data.js` hardcodes the `" 2"` filename. Keep one canonical file (or a `data/` folder + CLI arg).
- `dist/` is committed — add to `.gitignore`.
- README is still the raw Vite template — replace with (or point to) `DOCUMENTATION.md`.
- Consolidate the four ad-hoc `scripts/*.cjs` inspectors or note them as throwaway.

## D. UI / UX Findings (from live testing)

### D1. Map legibility at national zoom 🔴
Observed: a near-solid mass of overlapping pins covering all of India; individual facilities and even state shapes are indistinguishable. Clustering (B1) fixes most of it. Additionally consider: smaller pins at low zoom, and letting the dominant KIC category be toggled.

### D2. Popup opens clipped off-screen 🔴
Observed: clicking a marker in the lower half of the viewport opens the popup (anchor="top") extending **below the viewport edge** — the Overview content and tabs were cut off. Fix: remove the fixed `anchor` (MapLibre auto-anchors), or fly/ease the map so the popup fits.

### D3. Stale hover tooltip overlaps the popup 🟠
Observed: the black "Andhra Pradesh — Click to filter state" tooltip stayed on screen on top of the opened facility popup (mouse no longer produced a move event). Hide the tooltip when a popup is open, and on `click`.

### D4. Click-to-filter states is undiscoverable and unreliable 🟠
It only reveals itself via the hover tooltip, and with 1,277 pins the polygon is rarely clickable (see B1). Also affected by the name-mismatch bug (A1): some states filter to zero silently. After clustering, add visible affordance (cursor change + state outline on hover — which A2's fix provides).

### D5. No facility search 🟠
With 1,277 facilities there is no way to find one by name. A typeahead search (name/city/district) with fly-to-result would be the single biggest feature addition. All data is already in IndexedDB and indexed.

### D6. No filter reset / unclear active scope 🟡
No "clear all" control; the stats scope label shows only State or Region ("All" otherwise) — an active Discipline or type chip isn't reflected. Add a reset button and show active filters as removable tags.

### D7. No map legend 🟡
Pin colors/acronyms (RC/EXT/O especially) are never explained on the map. Add a small legend overlay (drive it from the C4 config so it can't drift).

### D8. No loading / empty states 🟡
On first load the map is briefly pinless while IndexedDB seeds (~1–2 s observed); a filter combination with zero matches (e.g. A1) shows an empty map with no message. Add a loading indicator and a "No facilities match these filters" notice with a reset action.

### D9. Panel & layout polish 🟡
- Charts sit below the fold of the 320 px scrollable panel — collapsible sections or a two-column stats layout would surface them.
- No responsive behavior: fixed 320 px panel + `100vw/100vh` — unusable on mobile despite being a PWA.
- `index.css` keeps template `body { display:flex; place-items:center }` and a dark `#242424` background that flashes before the app paints — remove both.

### D10. Accessibility 🟡
- Stat cards are clickable `<div>`s — no `role="button"`, no keyboard access, no focus styles.
- `<label>`s aren't associated with their `<select>`s (`htmlFor`/`id`).
- Facility category is conveyed by color + 8 px text on pins (below legibility threshold); tab buttons lack `aria-selected`.
- Emoji used as icons (📍👥📞💰) are announced literally by screen readers — wrap with `aria-hidden` + text labels.

## E. Suggested Order of Work

1. **Quick wins (≤ 1 hr):** A5 favicon, A1 alias map, D3 tooltip hide, B3 delete unused geojson, B4 dependency cleanup, C2 delete dead files, remove template CSS (D9).
2. **Headline fix:** B1 clustering + B2 re-render isolation → makes the map usable; then D4 works naturally with A2's hover fix.
3. **Correctness:** A3 discipline chart from `db.disciplines`; C4 unified taxonomy (fixes A4).
4. **Structure:** C1 component split + C3 types (do alongside #2–3 to avoid rework).
5. **Feature/UX round:** D5 search, D6 reset + filter tags, D7 legend, D8 loading/empty states.
6. **Later:** A6 PWA icons, D9 responsive layout, D10 accessibility pass, C6/C7 pipeline & repo hygiene.

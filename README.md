# SAI Facilities Finder

Interactive map of 1,277 Sports Authority of India facilities — filter by region/state/type/discipline, search by name, open per-facility details (trainees, disciplines, KISCE funds & manpower) and per-state report cards, with live statistics, marker clustering, and 3D/dark map modes. React + TypeScript + Vite + MapLibre, with all data stored client-side in IndexedDB (offline-capable PWA, no backend).

## Quick start

```bash
npm install        # run once per machine (native build deps are platform-specific)
npm run dev        # http://localhost:5173
```

`npm run build` (production build), `npm run lint` (oxlint), and `npm run preview` are also available.

## Updating the data

Edit the Excel master, then regenerate the static JSON:

```bash
npm run convert-data                 # uses "SAI_Facilities_Master 2.xlsx"
# or: node scripts/convert_data.js path/to/master.xlsx
```

This regenerates `public/data/*.json` and a `meta.json` version stamp; browsers reseed their local database automatically on next load.

## Docs

- [`CLAUDE.md`](CLAUDE.md) — project context, architecture invariants, coding & workflow rules (read this first)
- [`docs/architecture.md`](docs/architecture.md) — full architecture, data model, and feature reference
- [`docs/roadmap.md`](docs/roadmap.md) — forward plan and known issues
- [`CHANGELOG.md`](CHANGELOG.md) — notable changes
- [`REFINEMENTS.md`](REFINEMENTS.md) — historical audit findings

# SAI Facilities Finder

Interactive map of 1,277 Sports Authority of India facilities — filtering by region/state/type/discipline, per-facility details (trainees, disciplines, KISCE funds & manpower), and live statistics. React + TypeScript + Vite + MapLibre, with all data stored client-side in IndexedDB (offline-capable PWA).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

## Updating the data

Edit the Excel master, then:

```bash
npm run convert-data                 # uses "SAI_Facilities_Master 2.xlsx"
# or: node scripts/convert_data.js path/to/master.xlsx
```

This regenerates `public/data/*.json` and a `meta.json` version stamp; browsers reseed their local database automatically on next load.

## Docs

- `DOCUMENTATION.md` — full architecture, data model, and feature documentation
- `REFINEMENTS.md` — audit findings and refinement history

/*
 * apply_coordinate_updates.cjs
 * ----------------------------------------------------------------
 * Applies scripts/coordinate_overrides.json onto the shipped dataset
 * public/data/sai_facilities.json, then restamps public/data/meta.json
 * so browsers reseed their local IndexedDB with the new coordinates.
 *
 * Only the Latitude/Longitude of matched facilities are replaced and a
 * Google_Maps_URL field is added to those facilities. No other facility
 * and no other field is touched. The operation is idempotent (re-running
 * it produces the same dataset).
 *
 * Matching is by Facility_ID (resolved once, at override-generation time,
 * by build_coordinate_overrides.cjs). Each override's Facility_Name is
 * verified against the dataset as a safety guard.
 *
 * Usage: node scripts/apply_coordinate_updates.cjs
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const facPath = path.join(dataDir, 'sai_facilities.json');
const metaPath = path.join(dataDir, 'meta.json');
const overridesPath = path.join(__dirname, 'coordinate_overrides.json');

const facilities = JSON.parse(fs.readFileSync(facPath, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

const byId = new Map();
for (const f of facilities) {
  if (f.Facility_ID != null) byId.set(f.Facility_ID, f);
}

let applied = 0;
const missing = [];
const nameMismatch = [];

for (const ov of overrides) {
  const fac = byId.get(ov.Facility_ID);
  if (!fac) { missing.push(ov.Facility_ID); continue; }
  if (fac.Facility_Name !== ov.Facility_Name) {
    nameMismatch.push(`${ov.Facility_ID}: dataset="${fac.Facility_Name}" vs override="${ov.Facility_Name}"`);
  }
  fac.Latitude = Number(ov.Latitude);
  fac.Longitude = Number(ov.Longitude);
  if (ov.Google_Maps_URL) fac.Google_Maps_URL = ov.Google_Maps_URL;
  applied++;
}

// Validation: every applied facility's coordinates now equal the override, exactly.
let validationErrors = 0;
for (const ov of overrides) {
  const fac = byId.get(ov.Facility_ID);
  if (!fac) continue;
  if (fac.Latitude !== Number(ov.Latitude) || fac.Longitude !== Number(ov.Longitude)) {
    console.error(`Validation FAILED for ${ov.Facility_ID}`);
    validationErrors++;
  }
}

fs.writeFileSync(facPath, JSON.stringify(facilities, null, 2));

// Restamp meta.json (preserve shape; only bump generatedAt) so clients reseed.
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.generatedAt = new Date().toISOString();
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

console.log('Applied coordinate updates');
console.log('  Facilities in dataset :', facilities.length);
console.log('  Overrides             :', overrides.length);
console.log('  Applied               :', applied);
console.log('  Missing Facility_IDs  :', missing.length, missing.join(', ') || '');
console.log('  Name mismatches       :', nameMismatch.length, nameMismatch.join('; ') || '');
console.log('  Validation errors     :', validationErrors);
console.log('  meta.generatedAt      :', meta.generatedAt);
if (missing.length || validationErrors) process.exit(2);

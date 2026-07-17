/*
 * apply_project_gps_coordinates.cjs
 * ----------------------------------------------------------------
 * Applies scripts/project_gps_overrides.json onto public/data/sai_projects.json, then
 * restamps public/data/meta.json so browsers reseed with the new project coordinates.
 *
 * Each override sets (or explicitly clears, when Latitude/Longitude are null) a project's
 * Latitude, Longitude and Google_Maps_URL, matched by Project_Code. No other field and no
 * other project is touched. Idempotent — re-running produces the same dataset.
 *
 * Usage: node scripts/apply_project_gps_coordinates.cjs
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const projPath = path.join(dataDir, 'sai_projects.json');
const metaPath = path.join(dataDir, 'meta.json');
const overridesPath = path.join(__dirname, 'project_gps_overrides.json');

const projects = JSON.parse(fs.readFileSync(projPath, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

const byCode = new Map();
for (const p of projects) {
  if (p.Project_Code != null) byCode.set(p.Project_Code, p);
}

let applied = 0, cleared = 0;
const missing = [];
const nameMismatch = [];

for (const ov of overrides) {
  const proj = byCode.get(ov.Project_Code);
  if (!proj) { missing.push(ov.Project_Code); continue; }
  if (ov.Project_Name && proj.Project_Name !== ov.Project_Name) {
    nameMismatch.push(`${ov.Project_Code}: dataset="${proj.Project_Name}" vs override="${ov.Project_Name}"`);
  }
  proj.Latitude = ov.Latitude;
  proj.Longitude = ov.Longitude;
  proj.Google_Maps_URL = ov.Google_Maps_URL;
  if (ov.Latitude === null) cleared++; else applied++;
}

// Validation: every override's target now reads back exactly what was requested.
let validationErrors = 0;
for (const ov of overrides) {
  const proj = byCode.get(ov.Project_Code);
  if (!proj) continue;
  if (proj.Latitude !== ov.Latitude || proj.Longitude !== ov.Longitude || proj.Google_Maps_URL !== ov.Google_Maps_URL) {
    console.error(`Validation FAILED for ${ov.Project_Code}`);
    validationErrors++;
  }
}

fs.writeFileSync(projPath, JSON.stringify(projects, null, 2));

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.generatedAt = new Date().toISOString();
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

console.log('Applied project GPS coordinates');
console.log('  Projects in dataset    :', projects.length);
console.log('  Overrides              :', overrides.length);
console.log('  Applied (real coords)  :', applied);
console.log('  Cleared (no coords)    :', cleared);
console.log('  Missing Project_Codes  :', missing.length, missing.join(', ') || '');
console.log('  Name mismatches        :', nameMismatch.length, nameMismatch.join('; ') || '');
console.log('  Validation errors      :', validationErrors);
console.log('  meta.generatedAt       :', meta.generatedAt);
if (missing.length || validationErrors) process.exit(2);

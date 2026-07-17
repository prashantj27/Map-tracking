/*
 * apply_project_gps_coordinates.cjs
 * ----------------------------------------------------------------
 * Applies scripts/project_gps_overrides.json onto public/data/sai_projects.json, then
 * restamps public/data/meta.json so browsers reseed with the updated project data.
 *
 * Surgical: only fields actually PRESENT on an override object are written. A row with a newly
 * confirmed coordinate carries Latitude/Longitude/Google_Maps_URL/Without_GPS_Images and all four
 * are applied; a row with no confirmed coordinate carries only Without_GPS_Images:true, so its
 * existing Latitude/Longitude/Google_Maps_URL (e.g. an interim/approximate value from the original
 * import) are left completely untouched. Matched by Project_Code. Idempotent — re-running produces
 * the same dataset.
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

const FIELDS = ['Latitude', 'Longitude', 'Google_Maps_URL', 'Without_GPS_Images'];
let coordsUpdated = 0, flaggedOnly = 0;
const missing = [];
const nameMismatch = [];

for (const ov of overrides) {
  const proj = byCode.get(ov.Project_Code);
  if (!proj) { missing.push(ov.Project_Code); continue; }
  if (ov.Project_Name && proj.Project_Name !== ov.Project_Name) {
    nameMismatch.push(`${ov.Project_Code}: dataset="${proj.Project_Name}" vs override="${ov.Project_Name}"`);
  }
  for (const field of FIELDS) {
    if (Object.prototype.hasOwnProperty.call(ov, field)) proj[field] = ov[field];
  }
  if (Object.prototype.hasOwnProperty.call(ov, 'Latitude')) coordsUpdated++; else flaggedOnly++;
}

// Validation: every override's target now reads back exactly what was requested (for the fields
// the override actually specified — untouched fields are, by design, not checked here).
let validationErrors = 0;
for (const ov of overrides) {
  const proj = byCode.get(ov.Project_Code);
  if (!proj) continue;
  for (const field of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(ov, field)) continue;
    if (proj[field] !== ov[field]) {
      console.error(`Validation FAILED for ${ov.Project_Code}.${field}`);
      validationErrors++;
    }
  }
}

fs.writeFileSync(projPath, JSON.stringify(projects, null, 2));

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.generatedAt = new Date().toISOString();
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

console.log('Applied project GPS coordinates');
console.log('  Projects in dataset       :', projects.length);
console.log('  Overrides                 :', overrides.length);
console.log('  Coordinates updated       :', coordsUpdated);
console.log('  Flagged only (coords kept):', flaggedOnly);
console.log('  Missing Project_Codes     :', missing.length, missing.join(', ') || '');
console.log('  Name mismatches           :', nameMismatch.length, nameMismatch.join('; ') || '');
console.log('  Validation errors         :', validationErrors);
console.log('  meta.generatedAt          :', meta.generatedAt);
if (missing.length || validationErrors) process.exit(2);

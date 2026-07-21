/*
 * apply_project_status.cjs
 * ----------------------------------------------------------------
 * Applies scripts/project_status_overrides.json onto public/data/sai_projects.json (setting each
 * matched project's Status + Progress), then restamps public/data/meta.json so browsers reseed.
 *
 * Surgical + idempotent: only the fields present on an override (Status, Progress) are written;
 * everything else on the project (coordinates, Without_GPS_Images, etc.) is left untouched.
 * Without_GPS_Images is deliberately independent of Status — it is never modified here.
 *
 * Usage: node scripts/apply_project_status.cjs
 */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');
const projPath = path.join(dataDir, 'sai_projects.json');
const metaPath = path.join(dataDir, 'meta.json');
const overridesPath = path.join(__dirname, 'project_status_overrides.json');

const projects = JSON.parse(fs.readFileSync(projPath, 'utf8'));
const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

const byCode = new Map();
for (const p of projects) if (p.Project_Code != null) byCode.set(p.Project_Code, p);

const FIELDS = ['Status', 'Progress'];
let updated = 0;
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
  updated++;
}

// Validation: every override's target now reads back exactly what was requested.
let validationErrors = 0;
for (const ov of overrides) {
  const proj = byCode.get(ov.Project_Code);
  if (!proj) continue;
  for (const field of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(ov, field)) continue;
    if (proj[field] !== ov[field]) { console.error(`Validation FAILED for ${ov.Project_Code}.${field}`); validationErrors++; }
  }
}

fs.writeFileSync(projPath, JSON.stringify(projects, null, 2));

const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.generatedAt = new Date().toISOString();
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

const dist = {};
for (const p of projects) dist[p.Status] = (dist[p.Status] || 0) + 1;

console.log('Applied project status/progress');
console.log('  Projects in dataset       :', projects.length);
console.log('  Overrides                 :', overrides.length);
console.log('  Updated                   :', updated);
console.log('  Status distribution now   :', JSON.stringify(dist));
console.log('  Missing Project_Codes     :', missing.length, missing.join(', ') || '');
console.log('  Name mismatches           :', nameMismatch.length, nameMismatch.join('; ') || '');
console.log('  Validation errors         :', validationErrors);
console.log('  meta.generatedAt          :', meta.generatedAt);
if (missing.length || validationErrors) process.exit(2);

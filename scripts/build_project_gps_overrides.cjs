/*
 * build_project_gps_overrides.cjs — provenance / regeneration tool
 * ----------------------------------------------------------------------
 * Derives scripts/project_gps_overrides.json from an external coordinates workbook
 * ("Project coordinates final.xlsx"), matched to public/data/sai_projects.json by Project_Code
 * (the internal unique id — never a UI filter).
 *
 * Source workbook shape (two authoritative, DISJOINT lists that together cover every project):
 *   - Sheet "Projects With Image Coordinates" (one row per project that HAS a confirmed location):
 *     Project Code, Coordinates ("<lat>, <lng>"), Google Maps Link ("...?q=<lat>,<lng>").
 *   - Sheet "Projects Without Coordinates" (Project Code only): the projects that have NO confirmed
 *     location yet — these keep whatever coordinate they currently carry and are flagged as still
 *     needing GPS-verified site photos.
 *   - (An informational "Summary" sheet is ignored.)
 *
 * Behaviour:
 *   - Sheet 1 rows -> a coordinate override (Latitude/Longitude/Google_Maps_URL +
 *     Without_GPS_Images:false), so the project gets a PRJ map marker at that exact location.
 *     Coordinates are parsed from the Google Maps Link (per instruction) and cross-checked against
 *     the row's own Coordinates column (must agree, else abort).
 *   - Sheet 2 rows -> Latitude/Longitude/Google_Maps_URL are deliberately OMITTED from the override
 *     (apply_project_gps_coordinates.cjs only touches fields present in an override, so the project's
 *     EXISTING location is left exactly as it was). Only Without_GPS_Images:true is set — an explicit,
 *     permanent flag that these need GPS-verified photos, independent of whatever coordinate they carry.
 *   - Integrity: the two sheets must be disjoint (a code can't be both with- and without-coordinates,
 *     else abort). Codes not present in sai_projects.json are reported, never fabricated. Dataset
 *     projects covered by NEITHER sheet are reported (left untouched, by design).
 *
 * Usage: node scripts/build_project_gps_overrides.cjs "path/to/Project coordinates final.xlsx"
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/build_project_gps_overrides.cjs <path-to-Project coordinates final.xlsx>');
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error(`Source Excel not found: ${xlsxPath}`);
  process.exit(1);
}

const projPath = path.join(__dirname, '..', 'public', 'data', 'sai_projects.json');
const outPath = path.join(__dirname, 'project_gps_overrides.json');

const WITH_COORDS_SHEET = 'Projects With Image Coordinates';
const NO_COORDS_SHEET = 'Projects Without Coordinates';

const codeOf = (row) => String(row['Project Code'] || '').trim();

function parseLatLngFromLink(link) {
  if (!link) return null;
  const m = String(link).match(/q=([\-\d.]+),([\-\d.]+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function parseLatLngFromCoords(s) {
  if (!s) return null;
  const m = String(s).match(/([\-\d.]+)\s*,\s*([\-\d.]+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const projects = JSON.parse(fs.readFileSync(projPath, 'utf8'));
const byCode = new Map(projects.map((p) => [p.Project_Code, p]));

const wb = xlsx.readFile(xlsxPath);
for (const sheet of [WITH_COORDS_SHEET, NO_COORDS_SHEET]) {
  if (!wb.Sheets[sheet]) {
    console.error(`Sheet "${sheet}" not found in ${xlsxPath}. Sheets: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }
}
const withRows = xlsx.utils.sheet_to_json(wb.Sheets[WITH_COORDS_SHEET], { defval: null });
const withoutRows = xlsx.utils.sheet_to_json(wb.Sheets[NO_COORDS_SHEET], { defval: null });

const report = {
  withRows: withRows.length, withoutRows: withoutRows.length,
  applied: 0, flagged: 0, unmatched: [], linkMismatch: [], coordMissing: [],
};
const overrides = [];
const withCodes = new Set();
const withoutCodes = new Set();

// Sheet 1 — projects WITH a confirmed image-derived coordinate.
for (const row of withRows) {
  const code = codeOf(row);
  if (!code) continue;
  withCodes.add(code);
  const proj = byCode.get(code);
  if (!proj) { report.unmatched.push(code); continue; }

  const linkCoords = parseLatLngFromLink(row['Google Maps Link']);
  if (!linkCoords) { report.coordMissing.push(code); continue; }

  // Cross-check the link against the row's own Coordinates column (must agree).
  const colCoords = parseLatLngFromCoords(row['Coordinates']);
  if (colCoords && (Math.abs(linkCoords.lat - colCoords.lat) > 0.0005 || Math.abs(linkCoords.lng - colCoords.lng) > 0.0005)) {
    report.linkMismatch.push(`${code}: link(${linkCoords.lat},${linkCoords.lng}) vs Coordinates(${colCoords.lat},${colCoords.lng})`);
  }

  overrides.push({
    Project_Code: code,
    Project_Name: proj.Project_Name,
    Latitude: linkCoords.lat,
    Longitude: linkCoords.lng,
    Google_Maps_URL: String(row['Google Maps Link']).trim(),
    Without_GPS_Images: false,
  });
  report.applied++;
}

// Sheet 2 — projects WITHOUT a confirmed coordinate: keep their existing location untouched, just
// flag them. (Latitude/Longitude/Google_Maps_URL are deliberately omitted from the override.)
for (const row of withoutRows) {
  const code = codeOf(row);
  if (!code) continue;
  withoutCodes.add(code);
  const proj = byCode.get(code);
  if (!proj) { report.unmatched.push(code); continue; }
  overrides.push({ Project_Code: code, Project_Name: proj.Project_Name, Without_GPS_Images: true });
  report.flagged++;
}

// Integrity: the two sheets must be disjoint (a project is either with- or without-coordinates).
const inBoth = [...withCodes].filter((c) => withoutCodes.has(c));
if (inBoth.length) {
  console.error('ERROR: these Project Codes appear in BOTH sheets (with- and without-coordinates) — aborting:');
  console.error('   ', inBoth.join(', '));
  process.exit(2);
}

// Cross-check failures are a hard error — the coordinate source is internally inconsistent.
if (report.linkMismatch.length) {
  console.error(`ERROR: ${report.linkMismatch.length} rows where the Google Maps Link disagrees with the Coordinates column — aborting:`);
  report.linkMismatch.forEach((m) => console.error('   ', m));
  process.exit(2);
}

// Coverage: dataset projects touched by NEITHER sheet keep their current coord + flag (by design).
const neither = projects.map((p) => p.Project_Code).filter((c) => !withCodes.has(c) && !withoutCodes.has(c));

overrides.sort((a, b) => a.Project_Code.localeCompare(b.Project_Code));
fs.writeFileSync(outPath, JSON.stringify(overrides, null, 2) + '\n');

console.log('Project GPS override generation');
console.log('  Sheet "Projects With Image Coordinates" rows :', report.withRows);
console.log('  Sheet "Projects Without Coordinates" rows    :', report.withoutRows);
console.log('  Sheets disjoint                              : ✓');
console.log('  Overrides written                            :', overrides.length, '->', path.relative(process.cwd(), outPath));
console.log('  Applied (confirmed coords, flag=false)       :', report.applied);
console.log('  Flagged Without_GPS_Images=true (coords kept):', report.flagged);
console.log('  Unmatched (no such Project_Code)             :', report.unmatched.length, report.unmatched.join(', ') || '');
console.log('  Rows with unparseable link (skipped)         :', report.coordMissing.length, report.coordMissing.join(', ') || '');
console.log('  Dataset projects in NEITHER sheet (untouched):', neither.length, neither.join(', ') || '');
if (report.unmatched.length) {
  console.log('  NOTE: unmatched codes are not in sai_projects.json and were NOT added — creating a brand-new');
  console.log('        project record (parent facility, infra type, ordering) is convert_projects.cjs\'s job.');
}

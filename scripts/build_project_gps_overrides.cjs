/*
 * build_project_gps_overrides.cjs — provenance / regeneration tool
 * ----------------------------------------------------------------------
 * Derives scripts/project_gps_overrides.json from an external
 * "Project_Image_Coordinates_Enhanced.xlsx", matched to public/data/sai_projects.json
 * by Project_Code (the internal unique id — never a UI filter).
 *
 * Source workbook shape:
 *   - Sheet "Project Locations" (one row per in-scope project): Project Code, Project Name,
 *     State, Representative Latitude, Representative Longitude, Representative Coordinate,
 *     Google Maps Link. Most rows carry a real, geocoded Google Maps Link; a subset have an
 *     EMPTY link and null Representative Latitude/Longitude (Representative Coordinate reads
 *     "Not available") — these are rows where no confirmed location exists yet.
 *   - Sheet "Projects Without Coordinates": a plain Project Code/Name/State listing of exactly
 *     that same no-link subset, provided as an explicit cross-reference.
 *
 * Behaviour:
 *   - Rows with a parseable Google Maps Link (`?q=<lat>,<lng>`) -> a coordinate override
 *     (Latitude/Longitude/Google_Maps_URL + Without_GPS_Images:false), so the project gets a PRJ
 *     map marker at that exact, newly-confirmed location. Coordinates are taken from the link
 *     itself (per instruction), cross-checked against the Representative Latitude/Longitude
 *     columns (must match, else abort).
 *   - Rows with no link / "Not available" -> Latitude/Longitude/Google_Maps_URL are deliberately
 *     OMITTED from the override (apply_project_gps_coordinates.cjs only touches fields present in
 *     an override, so the project's EXISTING location — e.g. an earlier interim/approximate one —
 *     is left exactly as it was). Only Without_GPS_Images:true is set, an explicit, permanent flag
 *     that these need GPS-verified site photos, independent of whatever coordinate they carry.
 *   - The "Projects Without Coordinates" sheet is read purely as an integrity check: the script
 *     aborts if its codes don't exactly equal the no-link subset derived from sheet 1, so a future
 *     edit to either sheet that breaks this assumption is caught immediately rather than silently
 *     mis-flagging/mis-updating projects.
 *
 * Usage: node scripts/build_project_gps_overrides.cjs "path/to/Project_Image_Coordinates_Enhanced.xlsx"
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/build_project_gps_overrides.cjs <path-to-Project_Image_Coordinates_Enhanced.xlsx>');
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error(`Source Excel not found: ${xlsxPath}`);
  process.exit(1);
}

const projPath = path.join(__dirname, '..', 'public', 'data', 'sai_projects.json');
const outPath = path.join(__dirname, 'project_gps_overrides.json');

const LOCATIONS_SHEET = 'Project Locations';
const NO_COORD_SHEET = 'Projects Without Coordinates';

function parseLatLngFromLink(link) {
  if (!link) return null;
  const m = String(link).match(/q=([\-\d.]+),([\-\d.]+)/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const projects = JSON.parse(fs.readFileSync(projPath, 'utf8'));
const byCode = new Map(projects.map((p) => [p.Project_Code, p]));

const wb = xlsx.readFile(xlsxPath);
for (const sheet of [LOCATIONS_SHEET, NO_COORD_SHEET]) {
  if (!wb.Sheets[sheet]) {
    console.error(`Sheet "${sheet}" not found in ${xlsxPath}. Sheets: ${wb.SheetNames.join(', ')}`);
    process.exit(1);
  }
}
const locRows = xlsx.utils.sheet_to_json(wb.Sheets[LOCATIONS_SHEET], { defval: null });
const noCoordRows = xlsx.utils.sheet_to_json(wb.Sheets[NO_COORD_SHEET], { defval: null });

const report = { total: locRows.length, applied: 0, flagged: 0, unmatched: [], linkMismatch: [] };
const overrides = [];
const derivedNoLinkCodes = new Set();

for (const row of locRows) {
  const code = String(row['Project Code'] || '').trim();
  if (!code) continue;
  const proj = byCode.get(code);
  if (!proj) { report.unmatched.push(code); continue; }

  const linkCoords = parseLatLngFromLink(row['Google Maps Link']);

  if (!linkCoords) {
    // No newly-confirmed location for this project — flag it as needing GPS-verified photos, but
    // do NOT touch its coordinates (whatever it currently has, e.g. an interim/approximate one
    // from the original import, is left exactly as-is).
    derivedNoLinkCodes.add(code);
    overrides.push({ Project_Code: code, Project_Name: proj.Project_Name, Without_GPS_Images: true });
    report.flagged++;
    continue;
  }

  // Cross-check the link against the Representative Latitude/Longitude columns.
  const repLat = row['Representative Latitude'], repLng = row['Representative Longitude'];
  if (typeof repLat === 'number' && typeof repLng === 'number') {
    if (Math.abs(linkCoords.lat - repLat) > 0.0005 || Math.abs(linkCoords.lng - repLng) > 0.0005) {
      report.linkMismatch.push(`${code}: link(${linkCoords.lat},${linkCoords.lng}) vs column(${repLat},${repLng})`);
    }
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

// Integrity check: "Projects Without Coordinates" must exactly equal the no-link subset of sheet 1.
const sheet2Codes = new Set(noCoordRows.map((r) => String(r['Project Code'] || '').trim()).filter(Boolean));
const onlyInSheet2 = [...sheet2Codes].filter((c) => !derivedNoLinkCodes.has(c));
const onlyDerived = [...derivedNoLinkCodes].filter((c) => !sheet2Codes.has(c));
if (onlyInSheet2.length || onlyDerived.length) {
  console.error('ERROR: "Projects Without Coordinates" sheet does not match the no-link subset of "Project Locations" — aborting.');
  console.error('  In sheet2 but not derived as no-link:', JSON.stringify(onlyInSheet2));
  console.error('  Derived as no-link but not in sheet2:', JSON.stringify(onlyDerived));
  process.exit(2);
}

if (report.linkMismatch.length) {
  console.error(`ERROR: ${report.linkMismatch.length} rows where the Google Maps Link disagrees with the Representative Lat/Lng columns — aborting:`);
  report.linkMismatch.forEach((m) => console.error('   ', m));
  process.exit(2);
}

overrides.sort((a, b) => a.Project_Code.localeCompare(b.Project_Code));
fs.writeFileSync(outPath, JSON.stringify(overrides, null, 2) + '\n');

console.log('Project GPS override generation');
console.log('  Source rows (Project Locations) :', report.total);
console.log('  Sheet2 cross-check (Without Coordinates):', noCoordRows.length, '— exact match with derived no-link subset ✓');
console.log('  Overrides written               :', overrides.length, '->', path.relative(process.cwd(), outPath));
console.log('  Applied (new confirmed coords)  :', report.applied);
console.log('  Flagged Without_GPS_Images=true (coords left untouched):', report.flagged);
console.log('  Unmatched (no such Project_Code):', report.unmatched.length, report.unmatched.join(', ') || '');
if (report.unmatched.length) {
  console.log('  NOTE: these codes are not present in sai_projects.json and were NOT added — the pipeline that');
  console.log('        classifies/assigns a parent facility for a brand-new project (convert_projects.cjs) is a');
  console.log('        separate step; re-run that first if these should become new project records.');
}

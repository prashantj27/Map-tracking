/*
 * build_coordinate_overrides.cjs — provenance / regeneration tool
 * -----------------------------------------------------------------
 * Derives scripts/coordinate_overrides.json from an external
 * "Coordinate Update Report.xlsx" by matching each in-scope row to a
 * facility in public/data/sai_facilities.json.
 *
 * This documents HOW the committed overrides were produced. The
 * committed coordinate_overrides.json is the actual build input used by
 * apply_coordinate_updates.cjs; this generator only needs to be re-run
 * if the source Excel changes.
 *
 * Matching (intelligent, name-based, case/punctuation-insensitive):
 *   1. the master name quoted in the row's "Note / Remark"
 *      (`[Master S.No N: 'NAME']`), else
 *   2. the row's "Facility Name" column,
 *   both compared to Facility_Name after normalization.
 *
 * Gating: only rows with Confidence HIGH or MEDIUM AND a valid coordinate
 * pair produce an override. LOW-confidence and coordinate-less rows are
 * reported and skipped (their existing coordinates are retained).
 *
 * Usage: node scripts/build_coordinate_overrides.cjs "path/to/Coordinate Update Report.xlsx"
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/build_coordinate_overrides.cjs <path-to-Coordinate-Update-Report.xlsx>');
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error(`Source Excel not found: ${xlsxPath}`);
  process.exit(1);
}

const facPath = path.join(__dirname, '..', 'public', 'data', 'sai_facilities.json');
const outPath = path.join(__dirname, 'coordinate_overrides.json');

const UPDATE_SHEET = 'Update Report';

/** Lowercase, fold accents/quotes/&, strip punctuation to spaces, collapse whitespace. */
function normalizeName(s) {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extract the master facility name from a "Note / Remark" like [Master S.No 5: 'Bangalore']. */
function masterNameFromNote(note) {
  if (!note) return null;
  const m = String(note).match(/\[Master S\.No\s*[^:]*:\s*['‘’](.+?)['‘’]\]/i);
  return m ? m[1] : null;
}

/** Parse "lat, lng" into { lat, lng } of finite numbers within India's bounding box, else null. */
function parseCoords(raw) {
  if (raw == null) return null;
  const parts = String(raw).split(',').map((x) => parseFloat(String(x).trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  const [lat, lng] = parts;
  const inIndia = lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
  return { lat, lng, inIndia };
}

const facilities = JSON.parse(fs.readFileSync(facPath, 'utf8'));
const byName = new Map();
for (const f of facilities) {
  const k = normalizeName(f.Facility_Name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(f);
}

const wb = xlsx.readFile(xlsxPath);
const sheet = wb.Sheets[UPDATE_SHEET];
if (!sheet) {
  console.error(`Sheet "${UPDATE_SHEET}" not found in ${xlsxPath}. Sheets: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

const overrides = [];
const targetCount = new Map();
const report = { total: rows.length, applied: 0, skippedLow: [], skippedNoCoords: [], unmatched: [], ambiguous: [], outOfIndia: [] };

for (const row of rows) {
  const excelName = row['Facility Name'];
  const noteName = masterNameFromNote(row['Note / Remark']);
  const confidence = String(row['Confidence'] || '').trim().toUpperCase();
  const coords = parseCoords(row['Updated Coordinates']);
  const link = row['Google Maps Location Link'] ? String(row['Google Maps Location Link']).trim() : null;
  const label = `S.No ${row['S.No']} "${excelName}"`;

  const kNote = noteName ? normalizeName(noteName) : null;
  const kExcel = normalizeName(excelName);
  let matches = null;
  if (kNote && byName.has(kNote)) matches = byName.get(kNote);
  else if (byName.has(kExcel)) matches = byName.get(kExcel);

  if (!matches) { report.unmatched.push(label); continue; }
  if (matches.length > 1) {
    report.ambiguous.push(`${label} -> ${matches.length} facilities [${matches.map((m) => m.Facility_ID).join(', ')}]`);
    continue; // ambiguous: require manual review, do not auto-apply
  }
  const fac = matches[0];

  if (!coords) { report.skippedNoCoords.push(`${label} (${fac.Facility_ID})`); continue; }
  if (confidence.startsWith('LOW')) { report.skippedLow.push(`${label} (${fac.Facility_ID})`); continue; }
  if (!coords.inIndia) report.outOfIndia.push(`${label} -> [${coords.lat}, ${coords.lng}]`);

  targetCount.set(fac.Facility_ID, (targetCount.get(fac.Facility_ID) || 0) + 1);
  overrides.push({
    Facility_ID: fac.Facility_ID,
    Facility_Name: fac.Facility_Name,
    Latitude: coords.lat,
    Longitude: coords.lng,
    Google_Maps_URL: link,
    Confidence: confidence,
    Source_Row: `Update Report S.No ${row['S.No']}`,
  });
  report.applied++;
}

// Guard: a single facility targeted by more than one row is ambiguous.
const dupTargets = [...targetCount.entries()].filter(([, n]) => n > 1);

overrides.sort((a, b) => a.Facility_ID.localeCompare(b.Facility_ID));
fs.writeFileSync(outPath, JSON.stringify(overrides, null, 2) + '\n');

console.log('Coordinate override generation');
console.log('  Source rows           :', report.total);
console.log('  Overrides written     :', overrides.length, '->', path.relative(process.cwd(), outPath));
console.log('  Skipped (LOW conf)    :', report.skippedLow.length, report.skippedLow.join('; ') || '');
console.log('  Skipped (no coords)   :', report.skippedNoCoords.length, report.skippedNoCoords.join('; ') || '');
console.log('  Unmatched (no facility):', report.unmatched.length, report.unmatched.join('; ') || '');
console.log('  Ambiguous (>1 match)  :', report.ambiguous.length, report.ambiguous.join('; ') || '');
console.log('  Duplicate targets     :', dupTargets.length, dupTargets.map(([id, n]) => `${id}x${n}`).join(', ') || '');
console.log('  Out-of-India coords   :', report.outOfIndia.length, report.outOfIndia.join('; ') || '');
if (dupTargets.length) { console.error('ERROR: duplicate facility targets detected — resolve before applying.'); process.exit(2); }

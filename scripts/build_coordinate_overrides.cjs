/*
 * build_coordinate_overrides.cjs — provenance / regeneration tool
 * -----------------------------------------------------------------
 * Derives scripts/coordinate_overrides.json from an external
 * "Coordinate Update Report.xlsx" by matching each in-scope row to a
 * facility in public/data/sai_facilities.json.
 *
 * This documents HOW the committed overrides were produced. The committed
 * coordinate_overrides.json is the actual build input used by
 * apply_coordinate_updates.cjs; this generator only needs to be re-run if
 * the source Excel changes.
 *
 * Matching:
 *   - Non-KIC rows (RC/NCOE/STC/KISCE/Extension/NSTC/IGMA/Akhara) — by name
 *     (case/punctuation-insensitive): the master name quoted in the row's
 *     "Note / Remark" (`[Master S.No N: 'NAME']`), else the "Facility Name"
 *     column, compared to Facility_Name. Ambiguous names (one name → several
 *     facilities) are reported and skipped for manual review.
 *   - KIC rows (Khelo India Centres) — many share generic, repeated names
 *     ("District Khel Bhawan", "Indoor Sports Hall, <district>"), so name
 *     alone is ambiguous. The Update Report lists KIC rows in Facility_Master
 *     order, so they are matched positionally (row order ↔ KIC-#### order) and
 *     every position is VALIDATED by name equality. A single name mismatch
 *     aborts the run (never apply a mis-positioned coordinate).
 *
 * Gating (both paths): only rows with Confidence HIGH or MEDIUM AND a valid
 * coordinate pair produce an override. LOW-confidence rows (for KIC these are
 * explicitly "UNCHANGED — district-level coordinate retained") and rows
 * without coordinates are reported and skipped, leaving existing data intact.
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

/** Parse "lat, lng" into { lat, lng, inIndia } of finite numbers, else null. */
function parseCoords(raw) {
  if (raw == null) return null;
  const parts = String(raw).split(',').map((x) => parseFloat(String(x).trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  const [lat, lng] = parts;
  return { lat, lng, inIndia: lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98 };
}

/** True for Khelo India Centre facility-type strings (excludes KISCE). */
function isKIC(facilityType) {
  const t = String(facilityType || '').toLowerCase();
  if (/kisce|state centre/.test(t)) return false;
  return /khelo india centre|\bkic\b/.test(t);
}

const facilities = JSON.parse(fs.readFileSync(facPath, 'utf8'));
const wb = xlsx.readFile(xlsxPath);
const sheet = wb.Sheets[UPDATE_SHEET];
if (!sheet) {
  console.error(`Sheet "${UPDATE_SHEET}" not found in ${xlsxPath}. Sheets: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}
const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

const overrides = [];
const targetCount = new Map();
const report = {
  total: rows.length,
  skippedLow: [], skippedNoCoords: [], unmatched: [], ambiguous: [], outOfIndia: [],
};

function pushOverride(fac, coords, link, confidence, sno) {
  targetCount.set(fac.Facility_ID, (targetCount.get(fac.Facility_ID) || 0) + 1);
  overrides.push({
    Facility_ID: fac.Facility_ID,
    Facility_Name: fac.Facility_Name,
    Latitude: coords.lat,
    Longitude: coords.lng,
    Google_Maps_URL: link,
    Confidence: confidence,
    Source_Row: `Update Report S.No ${sno}`,
  });
}

function gate(row, coords) {
  const confidence = String(row['Confidence'] || '').trim().toUpperCase();
  if (!coords) { report.skippedNoCoords.push(`S.No ${row['S.No']} "${row['Facility Name']}"`); return null; }
  if (confidence.startsWith('LOW')) { report.skippedLow.push(`S.No ${row['S.No']} "${row['Facility Name']}"`); return null; }
  if (!coords.inIndia) report.outOfIndia.push(`S.No ${row['S.No']} -> [${coords.lat}, ${coords.lng}]`);
  return confidence;
}

// ---- Non-KIC rows: name matching ----
const kicRows = [];
const byName = new Map();
for (const f of facilities) {
  const k = normalizeName(f.Facility_Name);
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(f);
}

for (const row of rows) {
  if (isKIC(row['Facility Type'])) { kicRows.push(row); continue; }

  const noteName = masterNameFromNote(row['Note / Remark']);
  const kNote = noteName ? normalizeName(noteName) : null;
  const kExcel = normalizeName(row['Facility Name']);
  let matches = null;
  if (kNote && byName.has(kNote)) matches = byName.get(kNote);
  else if (byName.has(kExcel)) matches = byName.get(kExcel);

  const label = `S.No ${row['S.No']} "${row['Facility Name']}"`;
  if (!matches) { report.unmatched.push(label); continue; }
  if (matches.length > 1) {
    report.ambiguous.push(`${label} -> [${matches.map((m) => m.Facility_ID).join(', ')}]`);
    continue;
  }
  const coords = parseCoords(row['Updated Coordinates']);
  const confidence = gate(row, coords);
  if (!confidence) continue;
  const link = row['Google Maps Location Link'] ? String(row['Google Maps Location Link']).trim() : null;
  pushOverride(matches[0], coords, link, confidence, row['S.No']);
}

// ---- KIC rows: validated positional matching ----
const appKIC = facilities.filter((f) => isKIC(f.Facility_Type)).sort((a, b) => a.Facility_ID.localeCompare(b.Facility_ID));
kicRows.sort((a, b) => a['S.No'] - b['S.No']);

if (kicRows.length !== appKIC.length) {
  console.error(`ERROR: KIC row count (${kicRows.length}) != app KIC facility count (${appKIC.length}); positional match is unsafe.`);
  process.exit(2);
}
const nameValidationFailures = [];
for (let i = 0; i < kicRows.length; i++) {
  const row = kicRows[i];
  const fac = appKIC[i];
  if (normalizeName(row['Facility Name']) !== normalizeName(fac.Facility_Name)) {
    nameValidationFailures.push(`idx ${i} S.No ${row['S.No']} excel="${row['Facility Name']}" vs ${fac.Facility_ID} "${fac.Facility_Name}"`);
    continue;
  }
  const coords = parseCoords(row['Updated Coordinates']);
  const confidence = gate(row, coords);
  if (!confidence) continue;
  const link = row['Google Maps Location Link'] ? String(row['Google Maps Location Link']).trim() : null;
  pushOverride(fac, coords, link, confidence, row['S.No']);
}
if (nameValidationFailures.length) {
  console.error(`ERROR: ${nameValidationFailures.length} KIC positional name mismatches — aborting (would risk mis-placed coordinates):`);
  nameValidationFailures.slice(0, 20).forEach((m) => console.error('   ', m));
  process.exit(2);
}

// ---- Finalize ----
const dupTargets = [...targetCount.entries()].filter(([, n]) => n > 1);
overrides.sort((a, b) => a.Facility_ID.localeCompare(b.Facility_ID));
fs.writeFileSync(outPath, JSON.stringify(overrides, null, 2) + '\n');

console.log('Coordinate override generation');
console.log('  Source rows            :', report.total);
console.log('  KIC rows               :', kicRows.length, '(positional, name-validated)');
console.log('  Overrides written      :', overrides.length, '->', path.relative(process.cwd(), outPath));
console.log('  Skipped (LOW conf)     :', report.skippedLow.length);
console.log('  Skipped (no coords)    :', report.skippedNoCoords.length, report.skippedNoCoords.join('; ') || '');
console.log('  Unmatched (no facility):', report.unmatched.length, report.unmatched.join('; ') || '');
console.log('  Ambiguous name (non-KIC):', report.ambiguous.length, report.ambiguous.join('; ') || '');
console.log('  Duplicate targets      :', dupTargets.length, dupTargets.map(([id, n]) => `${id}x${n}`).join(', ') || '');
console.log('  Out-of-India coords    :', report.outOfIndia.length, report.outOfIndia.join('; ') || '');
if (dupTargets.length) { console.error('ERROR: duplicate facility targets detected — resolve before applying.'); process.exit(2); }

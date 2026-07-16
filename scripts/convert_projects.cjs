/*
 * convert_projects.cjs — Phase-1 Sports Infrastructure Projects pipeline
 * ----------------------------------------------------------------------
 * Reads the "Project mapping" Excel and writes public/data/sai_projects.json,
 * then bumps public/data/meta.json so browsers reseed their local IndexedDB.
 *
 * Each project is associated with a PARENT facility in its state:
 *   - the largest NCOE (highest trainee strength) where the state has one, else
 *   - the largest facility of any type in that state (so no project is orphaned;
 *     ~46% of project states have no NCOE, e.g. Rajasthan).
 * The parent temporarily stands in for the project location until per-project
 * coordinates are switched on (they are already parsed and stored below).
 *
 * The Excel already carries lat/long + remarks; both are persisted now so the
 * platform can switch to real project coordinates later with no schema change.
 *
 * Usage: node scripts/convert_projects.cjs "path/to/Project mapping.xlsx"
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const xlsxPath = process.argv[2];
if (!xlsxPath) { console.error('Usage: node scripts/convert_projects.cjs <path-to-Project-mapping.xlsx>'); process.exit(1); }
if (!fs.existsSync(xlsxPath)) { console.error(`Excel not found: ${xlsxPath}`); process.exit(1); }

const dataDir = path.join(__dirname, '..', 'public', 'data');
const facPath = path.join(dataDir, 'sai_facilities.json');
const outPath = path.join(dataDir, 'sai_projects.json');
const metaPath = path.join(dataDir, 'meta.json');

const facilities = JSON.parse(fs.readFileSync(facPath, 'utf8'));

// --- helpers ---
function isNCOE(t) { return /national centre of excellence|\bncoe\b/i.test(String(t || '')); }
function normState(s) {
  return String(s || '').toLowerCase().replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ').replace(/\bislands?\b/g, '').replace(/\s+/g, ' ').trim();
}
/** Fix common UTF-8-decoded-as-Latin1 mojibake and tidy whitespace. */
function cleanText(s) {
  if (s == null) return null;
  let t = String(s)
    .replace(/Ã—/g, '×').replace(/â€™/g, "'").replace(/â€˜/g, "'")
    .replace(/â€“/g, '–').replace(/â€”/g, '—').replace(/â€œ/g, '"').replace(/â€/g, '"')
    .replace(/â€/g, '"').replace(/Â/g, '').replace(/\s+/g, ' ').trim();
  return t || null;
}
function parseLatLng(s) {
  const m = String(s || '').match(/lat\s*:\s*([\-\d.]+).*?long?\s*:\s*([\-\d.]+)/i);
  if (!m) return { lat: null, lng: null };
  const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  return { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null };
}

/** Infrastructure type derived from the project name (order matters — specific first). */
function classifyInfra(name) {
  const n = String(name || '').toLowerCase();
  if (/swimming|\bpool\b/.test(n)) return 'Swimming Pool';
  if (/hockey/.test(n)) return 'Hockey Turf';
  if (/football/.test(n)) return 'Football Turf';
  if (/athletic|synthetic track|\btrack\b|\d+\s*[- ]?lane|\b400\s*m\b/.test(n)) return 'Athletics Track';
  if (/multi[\s-]*purpose|multipurpose|indoor (hall|block|stadium|arena)|\bindoor\b|\bhall\b/.test(n)) return 'Multipurpose Hall';
  if (/gymnas|\bgym\b/.test(n)) return 'Gymnasium';
  if (/hostel/.test(n)) return 'Hostel';
  if (/\bcourt\b|basketball|volleyball|badminton|tennis/.test(n)) return 'Court';
  if (/stadium|complex|infrastructure|astro|pavilion|turf|ground|field/.test(n)) return 'Sports Complex';
  return 'Other';
}

// --- index facilities by normalized state ---
const facByState = {};
for (const f of facilities) { const k = normState(f.State); (facByState[k] = facByState[k] || []).push(f); }

function resolveParent(stateName) {
  const list = facByState[normState(stateName)] || [];
  if (!list.length) return null;
  const ncoe = list.filter((f) => isNCOE(f.Facility_Type));
  const pool = ncoe.length ? ncoe : list;
  const pick = [...pool].sort((a, b) =>
    (b.Total_Trainees || 0) - (a.Total_Trainees || 0) ||
    (b.Sanctioned_Strength || 0) - (a.Sanctioned_Strength || 0))[0];
  return { fac: pick, isNCOE: ncoe.length > 0 };
}

// --- read rows ---
const wb = xlsx.readFile(xlsxPath);
const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });

// code-prefix -> state (recover the blank-State rows)
const prefixState = {};
for (const r of rows) {
  const m = String(r['Unique Code'] || '').match(/^([A-Za-z]+)/);
  if (m && r['State']) prefixState[m[1].toUpperCase()] = String(r['State']).trim();
}

const projects = [];
const report = { total: rows.length, mapped: 0, viaNCOE: 0, viaFallback: 0, noParent: [], noState: [] };
const infraDist = {};

rows.forEach((r, i) => {
  const code = cleanText(r['Unique Code']);
  // Skip rows without a real unique code — the source uses "-" for a handful of
  // cancelled duplicates; they share no id and would collide.
  if (!code || !/^[A-Za-z]{2,}\d+$/.test(code)) { report.noCode = (report.noCode || 0) + 1; return; }
  const prefix = code.match(/^([A-Za-z]+)/);
  const rawState = r['State'] ? String(r['State']).trim() : (prefix ? prefixState[prefix[1].toUpperCase()] : null);
  if (!rawState) { report.noState.push(code); return; }

  const parent = resolveParent(rawState);
  if (!parent) { report.noParent.push(code); return; }

  const { lat, lng } = parseLatLng(r['Localtion on Map']);
  const infra = classifyInfra(r['Project Name']);
  const remarks = cleanText(r['Remarks']);
  // Phase-1 status is "Data Awaiting"; where the source flags a project cancelled, reflect it.
  const status = remarks && /cancel/i.test(remarks) ? 'Cancelled' : 'Data Awaiting';
  infraDist[infra] = (infraDist[infra] || 0) + 1;
  report.mapped++;
  if (parent.isNCOE) report.viaNCOE++; else report.viaFallback++;

  projects.push({
    Project_Code: code,
    Project_Name: cleanText(r['Project Name']),
    State: parent.fac.State,               // canonical facility-data state name
    Parent_Facility_ID: parent.fac.Facility_ID,
    Parent_Facility_Name: parent.fac.Facility_Name,
    Parent_Is_NCOE: parent.isNCOE,
    Infra_Type: infra,
    Status: status,
    Order: i,                              // Excel row order — proxy for "recently added"
    Latitude: lat,                         // persisted for the future switch to project coords
    Longitude: lng,
    Remarks: remarks,
  });
});

projects.sort((a, b) => a.Project_Code.localeCompare(b.Project_Code));
fs.writeFileSync(outPath, JSON.stringify(projects, null, 2));

// bump meta so clients reseed with the new projects table
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
meta.generatedAt = new Date().toISOString();
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

console.log('Projects pipeline');
console.log('  Source rows        :', report.total);
console.log('  Projects written   :', projects.length, '->', path.relative(process.cwd(), outPath));
console.log('  Parent via NCOE    :', report.viaNCOE);
console.log('  Parent via fallback:', report.viaFallback);
console.log('  Skipped (no code)  :', report.noCode || 0);
console.log('  No state           :', report.noState.length, report.noState.join(',') || '');
console.log('  No parent facility :', report.noParent.length, report.noParent.join(',') || '');
console.log('  Cancelled projects :', projects.filter((p) => p.Status === 'Cancelled').length);
console.log('  Infra distribution :', JSON.stringify(infraDist));
console.log('  meta.generatedAt   :', meta.generatedAt);

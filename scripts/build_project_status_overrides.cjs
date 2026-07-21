/*
 * build_project_status_overrides.cjs — provenance / regeneration tool
 * ----------------------------------------------------------------------
 * Derives scripts/project_status_overrides.json from an external progress workbook
 * ("All_Projects_Consolidated_Progress.xlsx"), matched to public/data/sai_projects.json by
 * Project_Code. Re-run this (then apply_project_status.cjs) whenever an updated workbook arrives.
 *
 * Source workbook shape:
 *   - Sheet "All Projects": Project Code, Project Description, Progress (%) (a 0..1 fraction),
 *     Status (Completed / Cancelled / In Progress / Foreclosed / No Progress Data / ...).
 *     Rows without a Project Code (pre-code USIS projects) are ignored — they can't be mapped.
 *
 * --- The two rules that define how source data becomes platform data (change here if the mapping
 *     ever changes) ------------------------------------------------------------------------------ */

/** Map a raw source status to one of the platform's three: Completed, Cancelled, or In Progress. */
function mapStatus(raw) {
  const v = String(raw || '').trim();
  if (v === 'Completed') return 'Completed';
  if (v === 'Cancelled') return 'Cancelled';
  // Everything else (In Progress, No Progress Data, Foreclosed, blanks, …) counts as In Progress.
  return 'In Progress';
}

/** Derive { Status, Progress } for a project from its mapped status + raw 0..1 progress fraction. */
function deriveStatusProgress(rawStatus, rawFraction) {
  const Status = mapStatus(rawStatus);
  let Progress = null;
  if (Status === 'Completed') Progress = 100;                                   // Completed ⇒ 100%
  else if (Status === 'In Progress') Progress = typeof rawFraction === 'number' // real % (0..99)
    ? Math.max(0, Math.min(100, Math.round(rawFraction * 100)))
    : null;
  // Cancelled ⇒ no meaningful progress (Progress stays null).
  return { Status, Progress };
}
/* -------------------------------------------------------------------------------------------- */

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const xlsxPath = process.argv[2];
if (!xlsxPath) {
  console.error('Usage: node scripts/build_project_status_overrides.cjs <path-to-All_Projects_Consolidated_Progress.xlsx>');
  process.exit(1);
}
if (!fs.existsSync(xlsxPath)) {
  console.error(`Source Excel not found: ${xlsxPath}`);
  process.exit(1);
}

const projPath = path.join(__dirname, '..', 'public', 'data', 'sai_projects.json');
const outPath = path.join(__dirname, 'project_status_overrides.json');
const SHEET = 'All Projects';

const projects = JSON.parse(fs.readFileSync(projPath, 'utf8'));
const byCode = new Map(projects.map((p) => [p.Project_Code, p]));

const wb = xlsx.readFile(xlsxPath);
if (!wb.Sheets[SHEET]) {
  console.error(`Sheet "${SHEET}" not found in ${xlsxPath}. Sheets: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}
const rows = xlsx.utils.sheet_to_json(wb.Sheets[SHEET], { defval: null });

const codeOf = (r) => (r['Project Code'] == null ? '' : String(r['Project Code']).trim());
const overrides = [];
const seen = new Set();
const report = { rows: rows.length, noCode: 0, applied: 0, unmatched: [], duplicates: [], completedNot100: [] };
const dist = {};

for (const row of rows) {
  const code = codeOf(row);
  if (!code) { report.noCode++; continue; }
  if (seen.has(code)) { report.duplicates.push(code); continue; }
  seen.add(code);
  const proj = byCode.get(code);
  if (!proj) { report.unmatched.push(code); continue; }

  const raw = row['Status'];
  const frac = row['Progress (%)'];
  const { Status, Progress } = deriveStatusProgress(raw, frac);

  // Integrity note: source says Completed but the fraction isn't 100% (we still force Progress=100).
  if (mapStatus(raw) === 'Completed' && frac !== 1) report.completedNot100.push(`${code} (frac=${frac})`);

  overrides.push({ Project_Code: code, Project_Name: proj.Project_Name, Status, Progress });
  dist[Status] = (dist[Status] || 0) + 1;
  report.applied++;
}

// Dataset projects with no row in the workbook keep their current Status/Progress (reported).
const uncovered = projects.map((p) => p.Project_Code).filter((c) => !seen.has(c));

overrides.sort((a, b) => a.Project_Code.localeCompare(b.Project_Code));
fs.writeFileSync(outPath, JSON.stringify(overrides, null, 2) + '\n');

console.log('Project status/progress override generation');
console.log('  Source rows                      :', report.rows, `(${report.noCode} without a code — ignored)`);
console.log('  Overrides written                :', overrides.length, '->', path.relative(process.cwd(), outPath));
console.log('  Mapped status distribution       :', JSON.stringify(dist));
console.log('  Unmatched (no such Project_Code) :', report.unmatched.length, report.unmatched.join(', ') || '');
console.log('  Duplicate codes (first kept)     :', report.duplicates.length, report.duplicates.join(', ') || '');
console.log('  Dataset projects NOT in workbook :', uncovered.length, uncovered.join(', ') || '');
console.log('  Completed-but-not-100% (forced 100):', report.completedNot100.length, report.completedNot100.join(', ') || '');

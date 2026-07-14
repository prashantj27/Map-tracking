// Converts the SAI Excel master workbook into the static JSON files consumed
// by the app (public/data/*.json) and writes a meta.json version stamp that
// triggers a client-side IndexedDB reseed when the data changes.
//
// Usage: node scripts/convert_data.js [path/to/master.xlsx]

import * as fs from 'fs';
import * as path from 'path';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelFilePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'SAI_Facilities_Master 2.xlsx');
const outputDir = path.join(__dirname, '..', 'public', 'data');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// --- Discipline name cleaning (done here, at build time, so the client ships clean data) ---

function normalizeDisciplineName(raw) {
  if (!raw) return raw;
  let text = String(raw).trim().replace(/\(OSOG\)/gi, '').trim();
  text = text
    .replace(/^Kho0Kho$/i, 'Kho Kho')
    .replace(/^Kho-Kho$/i, 'Kho Kho')
    .replace(/^Sepak takraw$/i, 'Sepak Takraw')
    .replace(/^Sepaktakraw$/i, 'Sepak Takraw')
    .replace(/^K&C$/i, 'Kayaking & Canoeing')
    .replace(/^Kayak & Canoe$/i, 'Kayaking & Canoeing')
    .replace(/^Table-Tennis$/i, 'Table Tennis')
    .replace(/^Powerlifting-para$/i, 'Powerlifting-Para');
  return text;
}

function normalizeDisciplinesList(disciplines) {
  if (!disciplines) return null;
  const list = String(disciplines).split(',').map(normalizeDisciplineName);
  return Array.from(new Set(list.filter(Boolean))).sort().join(', ');
}

// --- Sheet processing ---

function processSheet(workbook, sheetName, outputFilename, filterFn, transformFn) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    console.warn(`Sheet ${sheetName} not found.`);
    return 0;
  }
  const data = xlsx.utils.sheet_to_json(sheet, { defval: null });
  let validData = filterFn ? data.filter(filterFn) : data;
  if (transformFn) validData = validData.map(transformFn);
  const outputPath = path.join(outputDir, outputFilename);
  fs.writeFileSync(outputPath, JSON.stringify(validData, null, 2));
  console.log(`Converted ${validData.length} records from ${sheetName} -> ${outputFilename}`);
  return validData.length;
}

try {
  const workbook = xlsx.readFile(excelFilePath);

  processSheet(
    workbook, 'Facility_Master', 'sai_facilities.json',
    (row) => row.Latitude && row.Longitude,
    (row) => ({
      ...row,
      Disciplines: normalizeDisciplinesList(row.Disciplines),
      Latitude: Number(row.Latitude),
      Longitude: Number(row.Longitude),
    })
  );

  processSheet(
    workbook, 'Discipline_Detail', 'sai_disciplines.json',
    (row) => !!row.Facility_ID,
    (row) => ({ ...row, Discipline: normalizeDisciplineName(row.Discipline) })
  );

  // Funds/manpower sheets use a "Facility_ID(s)" column — rename here so the client stays simple.
  const renameFacilityId = (row) => {
    const { 'Facility_ID(s)': facId, ...rest } = row;
    return { ...rest, Facility_ID: facId };
  };

  processSheet(workbook, 'KISCE_Funds', 'sai_funds.json', (row) => !!row['Facility_ID(s)'], renameFacilityId);
  processSheet(workbook, 'KISCE_Manpower', 'sai_manpower.json', (row) => !!row['Facility_ID(s)'], renameFacilityId);

  const meta = { generatedAt: new Date().toISOString(), source: path.basename(excelFilePath) };
  fs.writeFileSync(path.join(outputDir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`Wrote meta.json (version stamp ${meta.generatedAt})`);
} catch (error) {
  console.error('Error reading Excel file:', error);
  process.exitCode = 1;
}

import type { Location, Project, ManpowerDetail } from '../db';
import { formatProgress } from './projects';
import { isRealDiscipline } from './disciplineIcons';

/** "lat, lng" for a record with numeric coordinates, else "". */
function coordinates(lat: number | null, lng: number | null): string {
  return Number.isFinite(lat) && Number.isFinite(lng) ? `${lat}, ${lng}` : '';
}

/** A cell for a numeric field: the number itself (0 kept), or "" when the value is absent. */
function numOrBlank(v: number | null | undefined): number | string {
  return v === null || v === undefined ? '' : v;
}

interface StaffCounts { coachSanctioned: number; coachCurrent: number; totalSanctioned: number; totalCurrent: number; }

/**
 * Aggregate the manpower rows into per-facility staff counts, keyed by Facility_ID. A row counts as
 * a coach when its Designation contains "coach" (Head/Assistant Coach etc.); every manpower row —
 * coaches plus sport-science/management staff — rolls into the Total figures. "Sanctioned" = approved
 * posts, "Current" = people actually in position (verbatim from the source's Sanctioned/Current
 * Strength). Only ~34 facilities (the KISCE centres) carry manpower data; the rest get blank staff
 * cells rather than a misleading 0.
 */
function staffCountsByFacility(manpower: ManpowerDetail[]): Map<string, StaffCounts> {
  const map = new Map<string, StaffCounts>();
  for (const m of manpower) {
    const id = m.Facility_ID;
    if (!id) continue;
    let c = map.get(id);
    if (!c) { c = { coachSanctioned: 0, coachCurrent: 0, totalSanctioned: 0, totalCurrent: 0 }; map.set(id, c); }
    const sanctioned = Number(m['Sanctioned Strength']) || 0;
    const current = Number(m['Current Strength']) || 0;
    c.totalSanctioned += sanctioned;
    c.totalCurrent += current;
    if (/coach/i.test(m.Designation ?? '')) { c.coachSanctioned += sanctioned; c.coachCurrent += current; }
  }
  return map;
}

/**
 * A facility's real sport disciplines, taken verbatim from its `Disciplines` field (the same source
 * the discipline filter matches on) with non-sport placeholder rows dropped (e.g. "Yet to be
 * Started") so the column reflects exactly the disciplines the platform treats as real.
 */
function facilityDisciplines(raw: string | null): string {
  if (!raw) return '';
  return raw.split(',').map((s) => s.trim()).filter((d) => d && isRealDiscipline(d)).join(', ');
}

/**
 * Build + download an .xlsx from plain row objects. `xlsx` (SheetJS) is dynamically imported so
 * the ~425 kB library is code-split into its own chunk and only fetched on the first export — it
 * never weighs down the initial bundle. Shared by the facility and project exporters below.
 */
async function downloadSheet(
  rows: Record<string, string | number>[],
  header: string[],
  colWidths: number[],
  sheetName: string,
  filenameHint: string,
): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws['!cols'] = colWidths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const safeHint = (filenameHint || 'filtered').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60);
  XLSX.writeFile(wb, `SAI_${sheetName}_${safeHint}.xlsx`);
}

/** Download the given (already-filtered) facilities as a real .xlsx. */
export function exportFacilitiesToExcel(locations: Location[], manpower: ManpowerDetail[], filenameHint: string): Promise<void> {
  const staff = staffCountsByFacility(manpower);
  const header = [
    'S.No', 'Facility Type', 'Facility Name', 'Sports Disciplines',
    'Total Trainees', 'Trainees (Male)', 'Trainees (Female)', 'Sanctioned Strength (Trainees)',
    'Coaches (Sanctioned)', 'Coaches (Current)', 'Total Staff (Sanctioned)', 'Total Staff (Current)',
    'Operational Status', 'In-charge / Contact Person', 'Contact Number', 'SAI Region',
    'Coordinates', 'Address',
  ];
  const rows = locations.map((loc, i) => {
    const s = staff.get(loc.Facility_ID);
    return {
      'S.No': i + 1,
      'Facility Type': loc.Facility_Type ?? '',
      'Facility Name': loc.Facility_Name ?? '',
      'Sports Disciplines': facilityDisciplines(loc.Disciplines),
      'Total Trainees': numOrBlank(loc.Total_Trainees),
      'Trainees (Male)': numOrBlank(loc.Trainees_Male),
      'Trainees (Female)': numOrBlank(loc.Trainees_Female),
      'Sanctioned Strength (Trainees)': numOrBlank(loc.Sanctioned_Strength),
      'Coaches (Sanctioned)': s ? s.coachSanctioned : '',
      'Coaches (Current)': s ? s.coachCurrent : '',
      'Total Staff (Sanctioned)': s ? s.totalSanctioned : '',
      'Total Staff (Current)': s ? s.totalCurrent : '',
      'Operational Status': loc.Operational_Status ?? '',
      'In-charge / Contact Person': loc.Incharge_Contact_Person ?? '',
      'Contact Number': loc.Contact_Number ?? '',
      'SAI Region': loc.Parent_Region ?? '',
      'Coordinates': coordinates(loc.Latitude, loc.Longitude),
      'Address': [loc.Address, loc.City, loc.District, loc.State].filter(Boolean).join(', '),
    };
  });
  const widths = [6, 34, 48, 50, 13, 15, 16, 26, 18, 17, 20, 19, 18, 26, 16, 16, 24, 60];
  return downloadSheet(rows, header, widths, 'Facilities', filenameHint);
}

/** Download the given (already-filtered) projects as a real .xlsx. */
export function exportProjectsToExcel(projects: Project[], filenameHint: string): Promise<void> {
  const header = ['S.No', 'Project Code', 'Project Name', 'Infrastructure Type', 'Status', 'Progress', 'State', 'District', 'Coordinates', 'GPS Images Pending'];
  const rows = projects.map((p, i) => ({
    'S.No': i + 1,
    'Project Code': p.Project_Code ?? '',
    'Project Name': p.Project_Name ?? '',
    'Infrastructure Type': p.Infra_Type ?? '',
    'Status': p.Status ?? '',
    'Progress': formatProgress(p) ?? '',
    'State': p.State ?? '',
    'District': p.District ?? '',
    'Coordinates': coordinates(p.Latitude, p.Longitude),
    'GPS Images Pending': p.Without_GPS_Images === true ? 'Yes' : 'No',
  }));
  return downloadSheet(rows, header, [6, 12, 52, 22, 13, 10, 18, 18, 24, 18], 'Projects', filenameHint);
}

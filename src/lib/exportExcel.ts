import type { Location, Project } from '../db';
import { formatProgress } from './projects';

/** "lat, lng" for a record with numeric coordinates, else "". */
function coordinates(lat: number | null, lng: number | null): string {
  return Number.isFinite(lat) && Number.isFinite(lng) ? `${lat}, ${lng}` : '';
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
export function exportFacilitiesToExcel(locations: Location[], filenameHint: string): Promise<void> {
  const header = ['S.No', 'Facility Type', 'Facility Name', 'Coordinates', 'Address'];
  const rows = locations.map((loc, i) => ({
    'S.No': i + 1,
    'Facility Type': loc.Facility_Type ?? '',
    'Facility Name': loc.Facility_Name ?? '',
    'Coordinates': coordinates(loc.Latitude, loc.Longitude),
    'Address': [loc.Address, loc.City, loc.District, loc.State].filter(Boolean).join(', '),
  }));
  return downloadSheet(rows, header, [6, 34, 48, 24, 60], 'Facilities', filenameHint);
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

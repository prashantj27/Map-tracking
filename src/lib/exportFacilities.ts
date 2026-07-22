import type { Location } from '../db';

/** One exported row — column order matches the requested Excel layout. */
interface FacilityRow {
  'S.No': number;
  'Facility Type': string;
  'Facility Name': string;
  'Coordinates': string;
  'Address': string;
}

function fullAddress(loc: Location): string {
  return [loc.Address, loc.City, loc.District, loc.State].filter(Boolean).join(', ');
}

function coordinates(loc: Location): string {
  return Number.isFinite(loc.Latitude) && Number.isFinite(loc.Longitude)
    ? `${loc.Latitude}, ${loc.Longitude}`
    : '';
}

/**
 * Download the given (already-filtered) facilities as a real .xlsx. `xlsx` (SheetJS) is
 * dynamically imported so it only loads when the user actually exports — it never weighs down the
 * initial bundle. `filenameHint` describes the active filters (e.g. "KIC_Rajasthan").
 */
export async function exportFacilitiesToExcel(locations: Location[], filenameHint: string): Promise<void> {
  const XLSX = await import('xlsx');

  const rows: FacilityRow[] = locations.map((loc, i) => ({
    'S.No': i + 1,
    'Facility Type': loc.Facility_Type ?? '',
    'Facility Name': loc.Facility_Name ?? '',
    'Coordinates': coordinates(loc),
    'Address': fullAddress(loc),
  }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: ['S.No', 'Facility Type', 'Facility Name', 'Coordinates', 'Address'],
  });
  // Reasonable column widths so the sheet is readable on open.
  ws['!cols'] = [{ wch: 6 }, { wch: 34 }, { wch: 48 }, { wch: 24 }, { wch: 60 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Facilities');

  const safeHint = (filenameHint || 'filtered').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60);
  XLSX.writeFile(wb, `SAI_Facilities_${safeHint}.xlsx`);
}

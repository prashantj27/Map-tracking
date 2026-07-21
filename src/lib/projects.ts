import type { Project } from '../db';

/** Whether a project has usable coordinates (drives whether it gets a PRJ marker). */
export function hasProjectCoordinates(p: Project): boolean {
  return Number.isFinite(p.Latitude as number) && Number.isFinite(p.Longitude as number);
}

/**
 * The Projects (PRJ) GIS layer has its own identity colour, deliberately distinct from every
 * facility-type colour (deep violet). Marker colour is status-based and future-ready: add a new
 * status here and every PRJ marker/cluster/legend picks it up with no other change.
 */
export const PROJECT_COLOR = '#223f86';

const PROJECT_STATUS_COLORS: Record<string, string> = {
  'Data Awaiting': PROJECT_COLOR,
  'Cancelled': '#d93025',
  'In Progress': '#f9ab00',
  'Completed': '#188038',
  'On Hold': '#80868b',
};

export function getProjectStatusColor(status: string | null | undefined): string {
  return PROJECT_STATUS_COLORS[status ?? ''] ?? PROJECT_COLOR;
}

export interface InfraMeta { icon: string; color: string; }

/** Infrastructure types produced by scripts/convert_projects.cjs, with display metadata. */
export const INFRA_CONFIG: Record<string, InfraMeta> = {
  'Multipurpose Hall': { icon: '🏛️', color: '#6a1b9a' },
  'Athletics Track':   { icon: '🏃', color: '#e64a19' },
  'Sports Complex':    { icon: '🏟️', color: '#00838f' },
  'Hockey Turf':       { icon: '🏑', color: '#2e7d32' },
  'Football Turf':     { icon: '⚽', color: '#1b5e20' },
  'Swimming Pool':     { icon: '🏊', color: '#0277bd' },
  'Hostel':            { icon: '🏠', color: '#5d4037' },
  'Court':             { icon: '🏀', color: '#f57c00' },
  'Gymnasium':         { icon: '🤸', color: '#00695c' },
  'Other':             { icon: '🏗️', color: '#546e7a' },
};

export function getInfraMeta(type: string | null | undefined): InfraMeta {
  return INFRA_CONFIG[type ?? 'Other'] ?? INFRA_CONFIG.Other;
}

export interface StatusMeta { label: string; color: string; bg: string; }

export const STATUS_CONFIG: Record<string, StatusMeta> = {
  'Data Awaiting': { label: 'Data Awaiting', color: '#b06000', bg: '#fef7e0' },
  'Cancelled':     { label: 'Cancelled',     color: '#c5221f', bg: '#fce8e6' },
  'In Progress':   { label: 'In Progress',   color: '#b06000', bg: '#fef7e0' },
  'Completed':     { label: 'Completed',     color: '#188038', bg: '#e6f4ea' },
  'On Hold':       { label: 'On Hold',       color: '#5f6368', bg: '#f1f3f4' },
};

export function getStatusMeta(status: string | null | undefined): StatusMeta {
  return STATUS_CONFIG[status ?? 'Data Awaiting'] ?? STATUS_CONFIG['Data Awaiting'];
}

/**
 * Project Status quick-filter (bottom-left project filter bar, shown only when the Facility Type
 * selector is set to Projects). Status is a single-select among the three real statuses (set from
 * the progress workbook — see scripts/apply_project_status.cjs); a project matches simply when
 * `p.Status === key`. The "Without GPS Images" toggle is a SEPARATE, independent filter (below)
 * that ANDs with the status, so e.g. Completed + Without GPS Images = completed projects still
 * needing GPS-verified photos.
 */
export type ProjectStatusFilterKey = 'In Progress' | 'Completed' | 'Cancelled';

export interface ProjectStatusFilterMeta { key: ProjectStatusFilterKey; label: string; icon: string; color: string; }

export const PROJECT_STATUS_FILTERS: ProjectStatusFilterMeta[] = [
  { key: 'In Progress', label: 'In Progress', icon: '🟡', color: '#f9ab00' },
  { key: 'Completed',   label: 'Completed',   icon: '🟢', color: '#188038' },
  { key: 'Cancelled',   label: 'Cancelled',   icon: '🔴', color: '#d93025' },
];

/** Display meta for the independent "Without GPS Images" toggle (combines with the status filter). */
export const WITHOUT_GPS_FILTER = { label: 'Without GPS Images', icon: '📷', color: '#5f6368' } as const;

/**
 * Whether a project is currently in the "Without GPS Images" set — flagged `Without_GPS_Images`
 * by the source data and NOT since marked "Coordinates available" by the user (a sticky, per-browser
 * override stored alongside uploads, lib/imageStore.ts, that survives data reseeds). Independent of
 * the project's Status.
 */
export function projectIsWithoutGps(p: Project, coordinatesConfirmed: boolean): boolean {
  return p.Without_GPS_Images === true && !coordinatesConfirmed;
}

/**
 * Format a project's progress percentage for display, or null when there's nothing meaningful to
 * show (e.g. Cancelled projects, which carry no progress).
 */
export function formatProgress(p: Project): string | null {
  return typeof p.Progress === 'number' ? `${p.Progress}%` : null;
}

/** Count projects by infra type, ordered by INFRA_CONFIG then by count. */
export function infraBreakdown(projects: Project[]): Array<{ type: string; count: number }> {
  const counts = new Map<string, number>();
  for (const p of projects) counts.set(p.Infra_Type, (counts.get(p.Infra_Type) || 0) + 1);
  const order = Object.keys(INFRA_CONFIG);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => (order.indexOf(a.type) - order.indexOf(b.type)) || b.count - a.count);
}

/**
 * High-quality, self-contained placeholder illustration (inline SVG data URI — no network,
 * CSP/offline-safe). Shown for every project until real photos are uploaded/arrive.
 */
const PLACEHOLDER_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'>
  <defs>
    <linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#dbe9ff'/><stop offset='1' stop-color='#f4f8ff'/>
    </linearGradient>
    <linearGradient id='fld' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#34a853'/><stop offset='1' stop-color='#188038'/>
    </linearGradient>
  </defs>
  <rect width='800' height='500' fill='url(#sky)'/>
  <path d='M40 300 Q400 175 760 300 L760 345 Q400 220 40 345 Z' fill='#1a3d7c' opacity='0.92'/>
  <path d='M30 292 Q400 150 770 292' fill='none' stroke='#5b8def' stroke-width='10' stroke-linecap='round'/>
  <g fill='#9aa7bd'><rect x='170' y='150' width='6' height='150'/><rect x='624' y='150' width='6' height='150'/></g>
  <g fill='#ffd54f'><rect x='146' y='134' width='52' height='26' rx='4'/><rect x='600' y='134' width='52' height='26' rx='4'/></g>
  <ellipse cx='400' cy='402' rx='362' ry='120' fill='#e8710a'/>
  <ellipse cx='400' cy='402' rx='300' ry='92' fill='url(#fld)'/>
  <g fill='none' stroke='#ffffff' stroke-width='2' opacity='0.7'>
    <ellipse cx='400' cy='402' rx='300' ry='92'/>
    <line x1='400' y1='310' x2='400' y2='494'/>
    <ellipse cx='400' cy='402' rx='46' ry='26'/>
  </g>
</svg>`;

export const PLACEHOLDER_IMAGE = `data:image/svg+xml,${encodeURIComponent(PLACEHOLDER_SVG)}`;

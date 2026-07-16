// Single source of truth for facility-type taxonomy.
// Drives pin colors, acronyms, quick filters, stat cards, legend, and charts.

export type FacilityCategory =
  | 'RC'
  | 'NCOE'
  | 'STC'
  | 'EXT'
  | 'KIC'
  | 'KISCE'
  | 'NSTC'
  | 'IGMA'
  | 'AKHARA'
  | 'OTHER';

export interface FacilityCategoryConfig {
  label: string;
  acronym: string;
  color: string;
  lightBg: string;
}

export const FACILITY_CONFIG: Record<FacilityCategory, FacilityCategoryConfig> = {
  RC:     { label: 'Regional Centre',                  acronym: 'RC',    color: '#1a73e8', lightBg: '#e8f0fe' },
  NCOE:   { label: 'National Centre of Excellence',    acronym: 'NCOE',  color: '#ea4335', lightBg: '#fce8e6' },
  STC:    { label: 'SAI Training Centre',              acronym: 'STC',   color: '#188038', lightBg: '#e6f4ea' },
  EXT:    { label: 'Extension Centre of STC',          acronym: 'EXT',   color: '#f9ab00', lightBg: '#fef7e0' },
  KIC:    { label: 'Khelo India Centre',               acronym: 'KIC',   color: '#8e24aa', lightBg: '#f3e8fd' },
  KISCE:  { label: 'Khelo India State CoE',            acronym: 'KISCE', color: '#00acc1', lightBg: '#e0f7fa' },
  NSTC:   { label: 'NSTC Regular School',              acronym: 'NSTC',  color: '#00897b', lightBg: '#e0f2f1' },
  IGMA:   { label: 'Indigenous Games & Martial Arts',  acronym: 'IGMA',  color: '#e8710a', lightBg: '#feefe3' },
  AKHARA: { label: 'Adopted Akhara',                   acronym: 'AKH',   color: '#795548', lightBg: '#efebe9' },
  OTHER:  { label: 'Other',                            acronym: 'O',     color: '#9e9e9e', lightBg: '#f1f3f4' },
};

export const ALL_CATEGORIES = Object.keys(FACILITY_CONFIG) as FacilityCategory[];

/** Categories exposed as quick-filter chips / stat cards. */
export const QUICK_FILTER_CATEGORIES: FacilityCategory[] = ['NCOE', 'STC', 'KISCE', 'KIC'];

/** All facility-type chips shown in the sidebar filter (ordered). */
export const FILTER_CHIP_CATEGORIES: FacilityCategory[] = ['RC', 'NCOE', 'STC', 'EXT', 'KIC', 'KISCE', 'AKHARA'];

// Exact Facility_Type values found in the SAI master data.
const EXACT_MATCH: Record<string, FacilityCategory> = {
  'Regional Centre (RC)': 'RC',
  'National Centre of Excellence (NCOE)': 'NCOE',
  'SAI Training Centre (STC)': 'STC',
  'Extension Centre of STC': 'EXT',
  'Khelo India Centre (KIC)': 'KIC',
  'Khelo India State Centre of Excellence (KISCE)': 'KISCE',
  'NSTC (National Sports Talent Contest) Regular School': 'NSTC',
  'Indigenous Games & Martial Arts Centre (IGMA)': 'IGMA',
  'Adopted Akhara': 'AKHARA',
};

export function classifyFacility(facilityType: string | null | undefined): FacilityCategory {
  if (!facilityType) return 'OTHER';
  const exact = EXACT_MATCH[facilityType.trim()];
  if (exact) return exact;
  // Fallback for future/unknown spellings — order matters (KISCE before KIC, NSTC before STC).
  const t = facilityType.toLowerCase();
  if (t.includes('regional centre')) return 'RC';
  if (t.includes('ncoe')) return 'NCOE';
  if (t.includes('kisce')) return 'KISCE';
  if (t.includes('kic')) return 'KIC';
  if (t.includes('extension')) return 'EXT';
  if (t.includes('nstc')) return 'NSTC';
  if (t.includes('stc')) return 'STC';
  if (t.includes('igma') || t.includes('indigenous')) return 'IGMA';
  if (t.includes('akhara')) return 'AKHARA';
  return 'OTHER';
}

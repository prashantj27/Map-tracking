import Dexie, { type Table } from 'dexie';

export interface Location {
  id?: number;
  Facility_ID: string;
  Facility_Type: string;
  Facility_Name: string;
  State: string | null;
  District: string | null;
  City: string | null;
  Address: string | null;
  Disciplines: string | null;
  Trainees_Male: number | null;
  Trainees_Female: number | null;
  Total_Trainees: number | null;
  Sanctioned_Strength: number | null;
  Operational_Status: string | null;
  Incharge_Contact_Person: string | null;
  Contact_Number: string | null;
  Parent_Region: string | null;
  Latitude: number;
  Longitude: number;
  Remarks: string | null;
}

export interface DisciplineDetail {
  id?: number;
  Facility_ID: string;
  Discipline: string;
  Trainees_Male: number | null;
  Trainees_Female: number | null;
  Total_Trainees: number | null;
  Sanctioned_Strength: number | null;
}

export interface FundDetail {
  id?: number;
  Facility_ID: string;
  "Funds Released (Rs)": number | null;
  "Date of Sanction Order": string | null;
  "Date of Release": string | null;
  "Head": string | null;
  "UC Status": string | null;
  "Financial Year": string | null;
}

export interface ManpowerDetail {
  id?: number;
  Facility_ID: string;
  "Staff Category": string | null;
  "Designation": string | null;
  "Sanctioned Strength": number | null;
  "Current Strength": number | null;
  "Status": string | null;
}

export class MapDatabase extends Dexie {
  locations!: Table<Location>;
  disciplines!: Table<DisciplineDetail>;
  funds!: Table<FundDetail>;
  manpower!: Table<ManpowerDetail>;

  constructor() {
    super('MapDatabase');
    this.version(5).stores({
      locations: '++id, Facility_ID, Facility_Type, State, District, Disciplines',
      disciplines: '++id, Facility_ID, Discipline',
      funds: '++id, Facility_ID',
      manpower: '++id, Facility_ID'
    });
  }
}

export const db = new MapDatabase();

export type SeedResult = 'seeded' | 'already-seeded';

const SEED_META_KEY = 'db_seed_meta';
const LEGACY_SEED_KEY = 'db_seed_version';

async function fetchDataVersion(): Promise<string | null> {
  try {
    const res = await fetch('/data/meta.json');
    if (!res.ok) return null;
    const meta = await res.json();
    return typeof meta?.generatedAt === 'string' ? meta.generatedAt : null;
  } catch {
    return null; // offline — keep whatever data we already have
  }
}

async function doSeed(): Promise<SeedResult> {
  const dataVersion = await fetchDataVersion();

  let count = 0;
  try {
    count = await db.locations.count();
  } catch (e) {
    console.warn('Could not read database, will recreate:', e);
  }

  const storedVersion = localStorage.getItem(SEED_META_KEY);

  // Already seeded with the current data version — nothing to do.
  if (count > 0 && dataVersion !== null && storedVersion === dataVersion) {
    return 'already-seeded';
  }
  // Offline (no meta.json reachable) but we have data — don't wipe it.
  if (count > 0 && dataVersion === null) {
    return 'already-seeded';
  }

  console.log(`Seeding facility database (data version: ${dataVersion ?? 'unknown'})...`);
  await db.delete();
  await db.open();

  const [resFac, resDis, resFun, resMan] = await Promise.all([
    fetch('/data/sai_facilities.json'),
    fetch('/data/sai_disciplines.json'),
    fetch('/data/sai_funds.json'),
    fetch('/data/sai_manpower.json')
  ]);

  if (!resFac.ok || !resDis.ok || !resFun.ok || !resMan.ok) {
    throw new Error('Failed to fetch one or more data files.');
  }

  const [dataFac, dataDis, dataFun, dataMan] = await Promise.all([
    resFac.json(), resDis.json(), resFun.json(), resMan.json()
  ]);

  // Defensive coercion — the JSON is already cleaned at build time by scripts/convert_data.js.
  const cleanedFacilities: Location[] = dataFac.map((item: Location) => ({
    ...item,
    Latitude: Number(item.Latitude),
    Longitude: Number(item.Longitude)
  }));

  await db.locations.bulkAdd(cleanedFacilities);
  if (dataDis.length) await db.disciplines.bulkAdd(dataDis);
  if (dataFun.length) await db.funds.bulkAdd(dataFun);
  if (dataMan.length) await db.manpower.bulkAdd(dataMan);

  if (dataVersion !== null) localStorage.setItem(SEED_META_KEY, dataVersion);
  localStorage.removeItem(LEGACY_SEED_KEY);

  console.log(`Seeded ${cleanedFacilities.length} facilities, ${dataDis.length} disciplines, ${dataFun.length} funds, ${dataMan.length} manpower.`);
  return 'seeded';
}

let seedPromise: Promise<SeedResult> | null = null;

export function seedDatabase(): Promise<SeedResult> {
  if (!seedPromise) {
    seedPromise = doSeed().catch(err => {
      seedPromise = null; // allow retry on failure
      throw err;
    });
  }
  return seedPromise;
}

import Dexie, { type Table } from 'dexie';

/**
 * Uploaded project images live in their OWN IndexedDB database, deliberately separate
 * from the seeded MapDatabase. The facility/project data is wiped and re-seeded whenever
 * `meta.json` changes (see db.ts); keeping user uploads in a standalone store means those
 * data refreshes never destroy images an official has uploaded. Images are linked by
 * Project_Code, so when real project photos arrive later they slot in with no code change.
 */
export interface ProjectImage {
  id?: number;
  Project_Code: string;
  name: string;
  type: string;
  blob: Blob;
  uploadedAt: number;
}

/**
 * A user's "coordinates available" confirmation for a project. Lives in this same reseed-surviving
 * store (not the seeded MapDatabase) so that marking a project's coordinates available sticks across
 * data refreshes — the same guarantee uploaded images get. `Project_Code` is the primary key.
 */
export interface CoordinateConfirmation {
  Project_Code: string;
  confirmedAt: number;
}

class ImageDatabase extends Dexie {
  images!: Table<ProjectImage>;
  coordConfirmations!: Table<CoordinateConfirmation, string>;
  constructor() {
    super('ProjectImages');
    this.version(1).stores({ images: '++id, Project_Code, uploadedAt' });
    this.version(2).stores({
      images: '++id, Project_Code, uploadedAt',
      coordConfirmations: 'Project_Code, confirmedAt',
    });
  }
}

export const imageDb = new ImageDatabase();

/** Persist the image files for a project. Non-image files are ignored. Returns the count stored. */
export async function addProjectImages(projectCode: string, files: File[] | FileList): Promise<number> {
  const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
  if (!list.length) return 0;
  const now = Date.now();
  const records: ProjectImage[] = list.map((f, i) => ({
    Project_Code: projectCode,
    name: f.name || `image-${now + i}`,
    type: f.type,
    blob: f,
    uploadedAt: now + i,
  }));
  await imageDb.images.bulkAdd(records);
  return records.length;
}

/** Dexie query (for useLiveQuery) returning a project's uploaded images, oldest first. */
export function projectImagesQuery(projectCode: string) {
  return imageDb.images.where('Project_Code').equals(projectCode).sortBy('uploadedAt');
}

export async function deleteProjectImage(id: number): Promise<void> {
  await imageDb.images.delete(id);
}

/** Mark a project's GPS coordinates as available — removes it from the "Without GPS Images" filter. */
export async function confirmProjectCoordinates(projectCode: string): Promise<void> {
  await imageDb.coordConfirmations.put({ Project_Code: projectCode, confirmedAt: Date.now() });
}

/** Undo a "coordinates available" confirmation — the project returns to the filter. */
export async function unconfirmProjectCoordinates(projectCode: string): Promise<void> {
  await imageDb.coordConfirmations.delete(projectCode);
}

/** Reactive (useLiveQuery): whether this project has been marked "coordinates available". */
export function projectCoordinatesConfirmedQuery(projectCode: string): Promise<boolean> {
  return imageDb.coordConfirmations.get(projectCode).then((r) => r != null);
}

/** All Project_Codes marked "coordinates available" — powers the "Without GPS Images" filter. */
export function confirmedCoordinateCodes(): Promise<string[]> {
  return imageDb.coordConfirmations.toCollection().primaryKeys() as Promise<string[]>;
}

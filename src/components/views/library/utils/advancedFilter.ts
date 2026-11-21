import type { LibraryImage } from '../../../../stores/libraryStore';

export type FileTypeFilter = 'raw' | 'jpeg' | 'video' | 'other';

/** Filters beyond flag / rating / color / tag. `null` = no restriction. */
export interface AdvancedFilter {
  /** Inclusive capture-day range, "YYYY-MM-DD". */
  dateFrom: string | null;
  dateTo: string | null;
  camera: string | null;
  lens: string | null;
  fileType: FileTypeFilter | null;
  /** true = only photos with GPS coordinates, false = only photos without. */
  hasGps: boolean | null;
}

export const EMPTY_ADVANCED_FILTER: AdvancedFilter = {
  dateFrom: null,
  dateTo: null,
  camera: null,
  lens: null,
  fileType: null,
  hasGps: null,
};

/** Local capture day ("YYYY-MM-DD"), falling back to the file time. */
export function imageDay(img: LibraryImage): string | null {
  const m = (img.date || img.date_modified || '').match(/^(\d{4})[-:](\d{2})[-:](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  if (img.mtime) {
    const d = new Date(img.mtime * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

export function fileTypeOf(img: LibraryImage): FileTypeFilter {
  if (img.is_video) return 'video';
  if (img.is_raw) return 'raw';
  return /\.jpe?g$/i.test(img.name) ? 'jpeg' : 'other';
}

export function activeFilterCount(f: AdvancedFilter): number {
  return [f.dateFrom || f.dateTo, f.camera, f.lens, f.fileType, f.hasGps !== null].filter(Boolean).length;
}

export function matchesAdvancedFilter(img: LibraryImage, f: AdvancedFilter): boolean {
  if (f.dateFrom || f.dateTo) {
    const day = imageDay(img);
    if (!day || (f.dateFrom && day < f.dateFrom) || (f.dateTo && day > f.dateTo)) return false;
  }
  if (f.camera && img.camera !== f.camera) return false;
  if (f.lens && img.lens !== f.lens) return false;
  // A RAW+JPEG stack matches when any of its files has the type.
  if (f.fileType && !(img.stackMembers ?? [img]).some((m) => fileTypeOf(m) === f.fileType)) return false;
  if (f.hasGps !== null && (img.latitude != null && img.longitude != null) !== f.hasGps) return false;
  return true;
}

export interface FilterOptions {
  cameras: Array<{ name: string; count: number }>;
  lenses: Array<{ name: string; count: number }>;
  /** Years with photos, newest first. */
  years: string[];
}

const byCount = (m: Map<string, number>) =>
  [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

/** Cameras, lenses and years present in `images`, for the filter menus. */
export function collectFilterOptions(images: LibraryImage[]): FilterOptions {
  const cameras = new Map<string, number>();
  const lenses = new Map<string, number>();
  const years = new Set<string>();
  for (const img of images) {
    if (img.camera) cameras.set(img.camera, (cameras.get(img.camera) || 0) + 1);
    if (img.lens) lenses.set(img.lens, (lenses.get(img.lens) || 0) + 1);
    const day = imageDay(img);
    if (day) years.add(day.slice(0, 4));
  }
  return { cameras: byCount(cameras), lenses: byCount(lenses), years: [...years].sort().reverse() };
}

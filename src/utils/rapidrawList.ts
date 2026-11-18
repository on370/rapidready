// Pure helpers for the experimental "send the current list to RapidRAW" feature.
// No Tauri / React imports here so this can be unit-tested with plain `node`.

export interface RapidRawListItem {
  path: string;
  name?: string;
  is_video?: boolean;
}

export interface RapidRawList {
  paths: string[];
  active: string;
  /** True when the list is the multi-selection instead of the whole visible list. */
  isSelection: boolean;
}

// Mirrors VIDEO_EXTENSIONS in utils/image.ts (not imported to keep this module Tauri-free).
const VIDEO_EXT = /\.(mp4|mov|m4v|avi|mkv|webm|mts|m2ts)$/i;

/** RapidRAW cannot open videos, so they are left out of the list. */
export function isListEligible(item: RapidRawListItem): boolean {
  if (item.is_video) return false;
  return !VIDEO_EXT.test(item.name || item.path);
}

/**
 * Builds the list that is handed to RapidRAW.
 *
 * - `visible` is exactly what the grid shows (filters, search, stacking and sort already
 *   applied). A stack is represented by its primary (RAW) item, which is also what a plain
 *   "open in editor" opens, so stacks contribute exactly one path.
 * - With more than one selected photo, only the selection is sent (in grid order).
 * - Returns null when the active photo cannot be part of the list (e.g. a video, or a path
 *   that is not in the visible grid); the caller then falls back to a plain open.
 */
export function buildRapidRawList(
  visible: readonly RapidRawListItem[],
  selectedPaths: ReadonlySet<string>,
  activePath: string,
): RapidRawList | null {
  if (!activePath) return null;

  const seen = new Set<string>();
  const all: string[] = [];
  const selection: string[] = [];
  const useSelection = selectedPaths.size > 1;

  for (const item of visible) {
    if (!item.path || seen.has(item.path) || !isListEligible(item)) continue;
    seen.add(item.path);
    all.push(item.path);
    if (useSelection && selectedPaths.has(item.path)) selection.push(item.path);
  }

  if (useSelection && selection.length > 1 && selection.includes(activePath)) {
    return { paths: selection, active: activePath, isSelection: true };
  }
  if (seen.has(activePath)) {
    return { paths: all, active: activePath, isSelection: false };
  }
  return null;
}

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface RapidRawTitleState {
  /** Folder / collection / "Last import" label, already localized. */
  scopeName: string | null;
  isSelection: boolean;
  count: number;
  filterMode: string;
  ratingFilter: number | null;
  colorFilter: string | null;
  tagFilter: string | null;
  sortBy: string | null;
  /** Collections keep their manual order, so no sort label there. */
  manualOrder?: boolean;
}

/** Short, localized human description of the current view, e.g. "Iceland · Picks · sorted by Rating". */
export function buildRapidRawListTitle(t: Translate, s: RapidRawTitleState): string {
  const parts: string[] = [];
  if (s.scopeName) parts.push(s.scopeName);
  if (s.isSelection) parts.push(t('rapidrawList.selection', { count: s.count }));

  if (s.filterMode === 'picks') parts.push(t('filters.picks'));
  else if (s.filterMode === 'rejected') parts.push(t('filters.rejected'));
  else if (s.filterMode.startsWith('rated')) {
    const stars = parseInt(s.filterMode.replace('rated', ''), 10) || 1;
    parts.push(t('rapidrawList.minStars', { count: stars }));
  }
  if (s.ratingFilter !== null && s.ratingFilter > 0) {
    parts.push(t('rapidrawList.minStars', { count: s.ratingFilter }));
  }
  if (s.colorFilter) parts.push(t(`colors.${s.colorFilter}`));
  if (s.tagFilter) parts.push(`#${s.tagFilter}`);

  if (!s.manualOrder && s.sortBy) {
    parts.push(t('rapidrawList.sortedBy', { field: t(`sort.${s.sortBy}`) }));
  }

  return parts.length > 0 ? parts.join(' · ') : 'RapidReady';
}

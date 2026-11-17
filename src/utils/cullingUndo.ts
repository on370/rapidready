// Pure helpers for culling undo/redo (no store or Tauri imports, so they stay unit-testable).

export interface CullingSnapshot {
  flag: number | null;
  rating: number;
  color: string | null;
  tags: string[];
}

export type CullingField = keyof CullingSnapshot;
export type UndoKind = CullingField | 'culling' | 'rotation';
export type RotationDirection = 'cw' | 'ccw';

export interface CullingChange {
  path: string;
  before: CullingSnapshot;
  after: CullingSnapshot;
}

export type UndoStep =
  | { type: 'culling'; kind: UndoKind; changes: CullingChange[] }
  | { type: 'rotation'; kind: 'rotation'; paths: string[]; direction: RotationDirection };

export type CullingPatch = Partial<CullingSnapshot> | ((current: CullingSnapshot) => Partial<CullingSnapshot>);

/** One store/disk write: `patch` holds only the fields the step touched. */
export interface RestoreGroup {
  paths: string[];
  patch: Partial<CullingSnapshot>;
  /** Full target state, set for single-path groups that restore tags. */
  full?: CullingSnapshot;
}

export const UNDO_LIMIT = 100;
const FIELDS: CullingField[] = ['flag', 'rating', 'color', 'tags'];

export function toSnapshot(c: { flag?: number | null; rating?: number; color?: string | null; tags?: string[] }): CullingSnapshot {
  return {
    flag: c.flag ?? null,
    rating: c.rating ?? 0,
    color: c.color ?? null,
    tags: [...(c.tags ?? [])],
  };
}

function fieldEqual(a: CullingSnapshot, b: CullingSnapshot, field: CullingField): boolean {
  if (field === 'tags') {
    return a.tags.length === b.tags.length && a.tags.every((t, i) => t === b.tags[i]);
  }
  return a[field] === b[field];
}

export function changedFields(a: CullingSnapshot, b: CullingSnapshot): CullingField[] {
  return FIELDS.filter(f => !fieldEqual(a, b, f));
}

/**
 * Builds an undo step from the current states of the target photos and the change
 * about to be applied. Photos the change does not affect are left out; returns null
 * when nothing changes.
 */
export function buildCullingStep(
  current: Array<{ path: string; culling: CullingSnapshot }>,
  patch: CullingPatch
): UndoStep | null {
  const changes: CullingChange[] = [];
  const touched = new Set<CullingField>();
  const seen = new Set<string>();
  for (const { path, culling } of current) {
    if (seen.has(path)) continue;
    seen.add(path);
    const before = toSnapshot(culling);
    const delta = typeof patch === 'function' ? patch(before) : patch;
    const after = toSnapshot({ ...before, ...delta });
    const fields = changedFields(before, after);
    if (fields.length === 0) continue;
    fields.forEach(f => touched.add(f));
    changes.push({ path, before, after });
  }
  if (changes.length === 0) return null;
  const kind: UndoKind = touched.size === 1 ? [...touched][0] : 'culling';
  return { type: 'culling', kind, changes };
}

/**
 * Groups the writes needed to move every photo of a step to `side`. Photos that end up
 * with identical patches share one batch write; tag restores are per photo because the
 * batch command can only add or remove a single tag.
 */
export function planRestore(changes: CullingChange[], side: 'before' | 'after'): RestoreGroup[] {
  const groups = new Map<string, RestoreGroup>();
  const result: RestoreGroup[] = [];
  for (const change of changes) {
    const target = change[side];
    const fields = changedFields(change.before, change.after);
    if (fields.length === 0) continue;
    const patch: Partial<CullingSnapshot> = {};
    for (const f of fields) {
      (patch as Record<string, unknown>)[f] = f === 'tags' ? [...target.tags] : target[f];
    }
    if (fields.includes('tags')) {
      result.push({ paths: [change.path], patch, full: toSnapshot(target) });
      continue;
    }
    const key = JSON.stringify(patch);
    const group = groups.get(key);
    if (group) {
      group.paths.push(change.path);
    } else {
      const created: RestoreGroup = { paths: [change.path], patch };
      groups.set(key, created);
      result.push(created);
    }
  }
  return result;
}

/** Keeps only the photos for which `keep` returns true; null if none remain. */
export function restrictStep(step: UndoStep, keep: (path: string) => boolean): UndoStep | null {
  if (step.type === 'rotation') {
    const paths = step.paths.filter(keep);
    return paths.length > 0 ? { ...step, paths } : null;
  }
  const changes = step.changes.filter(c => keep(c.path));
  return changes.length > 0 ? { ...step, changes } : null;
}

export function stepSize(step: UndoStep): number {
  return step.type === 'rotation' ? step.paths.length : step.changes.length;
}

export function inverseDirection(direction: RotationDirection): RotationDirection {
  return direction === 'cw' ? 'ccw' : 'cw';
}

export interface UndoHistory {
  past: UndoStep[];
  future: UndoStep[];
}

/** Records a new user action: bounded history, and the redo stack is discarded. */
export function pushStep(history: UndoHistory, step: UndoStep, limit = UNDO_LIMIT): UndoHistory {
  return { past: [...history.past, step].slice(-limit), future: [] };
}

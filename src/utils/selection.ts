/**
 * Pure helpers for file-manager style range selection (Shift / Ctrl+Shift).
 */

/**
 * Resolves the range anchor to an index in the current ordering. The anchor is
 * tracked by path so it survives filtering and sorting; if it is no longer
 * displayed, the fallback index (usually the active photo) is used instead.
 */
export function resolveAnchorIndex(
  orderedPaths: readonly string[],
  anchorPath: string | null,
  fallbackIndex: number
): number {
  if (anchorPath !== null) {
    const idx = orderedPaths.indexOf(anchorPath);
    if (idx !== -1) return idx;
  }
  if (orderedPaths.length === 0) return -1;
  return fallbackIndex >= 0 && fallbackIndex < orderedPaths.length ? fallbackIndex : 0;
}

/**
 * Returns the selection for a range from `anchorIndex` to `targetIndex` (inclusive).
 * Without `base` the range replaces the selection (Shift); with `base` it is
 * added to it (Ctrl/Cmd+Shift). The input set is never mutated.
 */
export function computeRangeSelection(
  orderedPaths: readonly string[],
  anchorIndex: number,
  targetIndex: number,
  base?: ReadonlySet<string>
): Set<string> {
  const next = new Set<string>(base);
  if (anchorIndex < 0) anchorIndex = targetIndex;
  const start = Math.max(0, Math.min(anchorIndex, targetIndex));
  const end = Math.min(orderedPaths.length - 1, Math.max(anchorIndex, targetIndex));
  for (let i = start; i <= end; i++) {
    next.add(orderedPaths[i]);
  }
  return next;
}

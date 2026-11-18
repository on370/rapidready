/**
 * Helpers for "Export selected…" in the library grid.
 *
 * Kept free of app imports so it can be unit-tested with plain `node`.
 */

export interface ExportGridItem {
  path: string;
  /** Present on stacked RAW+JPG items; includes the representative itself. */
  stackMembers?: { path: string }[];
}

function normalizeForCompare(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * Collects the file paths to export for the current selection, in the order
 * the items are shown in the grid. Stacked items contribute all of their
 * members (representative first), matching how other batch actions expand
 * stacks. Duplicates (by normalized path) are dropped.
 *
 * Selected paths that are not part of `gridItems` (e.g. selected, then hidden
 * by a filter) are appended at the end in selection order so nothing the user
 * selected is silently skipped.
 */
export function collectSelectionForExport(
  gridItems: ExportGridItem[],
  selectedPaths: Iterable<string>,
  options: { expandStacks: boolean }
): string[] {
  const selectedNorm = new Set<string>();
  const selectedOrdered: string[] = [];
  for (const p of selectedPaths) {
    const norm = normalizeForCompare(p);
    if (!selectedNorm.has(norm)) {
      selectedNorm.add(norm);
      selectedOrdered.push(p);
    }
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const push = (p: string) => {
    const norm = normalizeForCompare(p);
    if (seen.has(norm)) return;
    seen.add(norm);
    result.push(p);
  };

  const coveredSelection = new Set<string>();
  for (const item of gridItems) {
    const norm = normalizeForCompare(item.path);
    if (!selectedNorm.has(norm)) continue;
    coveredSelection.add(norm);
    push(item.path);
    if (options.expandStacks && item.stackMembers) {
      for (const m of item.stackMembers) push(m.path);
    }
  }

  for (const p of selectedOrdered) {
    if (!coveredSelection.has(normalizeForCompare(p))) push(p);
  }

  return result;
}

interface RatedItem {
  culling: { rating: number; flag: number | null };
}

interface PathItem {
  path: string;
}

const MAX_RATING = 5;
// One bucket per (rating, flag) pair: rating 0..5 x flag -1/0/1.
const BUCKET_COUNT = (MAX_RATING + 1) * 3;

function ratingBucket(item: RatedItem): number {
  const rating = Math.min(MAX_RATING, Math.max(0, (item.culling.rating || 0) | 0));
  const flag = Math.sign(item.culling.flag || 0);
  return rating * 3 + flag + 1;
}

/**
 * Orders items by rating, then by flag (pick > none > reject), in the given direction.
 * Stable: items with the same rating and flag keep their input order, so callers pass
 * the list pre-sorted by the tie-breaker (filename). Counting sort, O(n), cheap enough
 * to re-run on every rating change.
 */
export function sortByRating<T extends RatedItem>(items: readonly T[], direction: 'asc' | 'desc'): T[] {
  const buckets: T[][] = Array.from({ length: BUCKET_COUNT }, () => []);
  for (const item of items) {
    buckets[ratingBucket(item)].push(item);
  }
  const result: T[] = [];
  if (direction === 'asc') {
    for (let b = 0; b < BUCKET_COUNT; b++) {
      for (const item of buckets[b]) result.push(item);
    }
  } else {
    for (let b = BUCKET_COUNT - 1; b >= 0; b--) {
      for (const item of buckets[b]) result.push(item);
    }
  }
  return result;
}

/**
 * Resolves the index of the active photo in `items`. The stored index is only trusted
 * while it still points at a selected photo; after a re-sort or filter change it falls
 * back to the first selected photo, so focus follows the photo rather than the slot.
 */
export function resolveActiveIndex(items: readonly PathItem[], storedIndex: number, selectedPaths: ReadonlySet<string>): number {
  if (items.length === 0) return 0;
  const clamped = Math.min(Math.max(storedIndex, 0), items.length - 1);
  if (selectedPaths.size === 0 || selectedPaths.has(items[clamped].path)) return clamped;
  const idx = items.findIndex((item) => selectedPaths.has(item.path));
  return idx !== -1 ? idx : clamped;
}

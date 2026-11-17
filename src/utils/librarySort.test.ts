import { sortByRating, resolveActiveIndex } from './librarySort.ts';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}
assert.strictEqual = (a: any, b: any, msg?: string) => {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
};

const img = (path: string, rating: number, flag: number | null = null) => ({ path, culling: { rating, flag } });
const paths = (items: { path: string }[]) => items.map((i) => i.path).join(',');

console.log('Testing library sort...');

// 1. Rating descending, flag as secondary key, input order as tie-breaker
{
  const list = [img('a', 3), img('b', 5), img('c', 3, 1), img('d', 0, -1), img('e', 3), img('f', 0)];
  assert.strictEqual(paths(sortByRating(list, 'desc')), 'b,c,a,e,f,d');
  assert.strictEqual(paths(sortByRating(list, 'asc')), 'd,f,a,e,c,b');
  assert.strictEqual(paths(list), 'a,b,c,d,e,f', 'input must not be mutated');
}

// 2. Missing / out-of-range values are clamped instead of throwing
{
  const list = [img('a', 9), { path: 'b', culling: { rating: undefined as unknown as number, flag: null } }, img('c', -2)];
  assert.strictEqual(paths(sortByRating(list, 'desc')), 'a,b,c');
}

// 3. Re-sort after a rating change moves the photo
{
  const before = [img('a', 0), img('b', 0), img('c', 0)];
  const after = [img('a', 0), img('b', 4), img('c', 0)];
  assert.strictEqual(paths(sortByRating(before, 'desc')), 'a,b,c');
  assert.strictEqual(paths(sortByRating(after, 'desc')), 'b,a,c');
}

// 4. Active index follows the selected photo, not the slot
{
  const list = [img('b', 4), img('a', 0), img('c', 0)];
  assert.strictEqual(resolveActiveIndex(list, 1, new Set(['b'])), 0, 'moved photo is found by path');
  assert.strictEqual(resolveActiveIndex(list, 1, new Set(['a'])), 1, 'valid index is kept');
  assert.strictEqual(resolveActiveIndex(list, 7, new Set(['c'])), 2, 'out-of-range index');
  assert.strictEqual(resolveActiveIndex(list, 7, new Set()), 2, 'no selection clamps');
  assert.strictEqual(resolveActiveIndex(list, 1, new Set(['gone'])), 1, 'selected photo filtered out clamps');
  assert.strictEqual(resolveActiveIndex([], 3, new Set(['a'])), 0, 'empty list');
}

console.log('All library sort tests passed.');

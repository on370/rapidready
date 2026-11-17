import { resolveAnchorIndex, computeRangeSelection } from './selection.ts';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}
assert.strictEqual = (a: any, b: any, msg?: string) => {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
};

const sorted = (s: Set<string>) => [...s].sort().join(',');

console.log('Testing range selection...');

const paths = ['a', 'b', 'c', 'd', 'e', 'f'];

// 1. Anchor resolution by path, independent of position
{
  assert.strictEqual(resolveAnchorIndex(paths, 'd', 0), 3);
  // After re-sorting, the same path resolves to its new index
  assert.strictEqual(resolveAnchorIndex(['f', 'e', 'd', 'c', 'b', 'a'], 'd', 0), 2);
  // Anchor filtered out -> fallback index
  assert.strictEqual(resolveAnchorIndex(paths, 'zzz', 4), 4);
  assert.strictEqual(resolveAnchorIndex(paths, null, 2), 2);
  // Invalid fallback -> first photo
  assert.strictEqual(resolveAnchorIndex(paths, null, -1), 0);
  assert.strictEqual(resolveAnchorIndex(paths, null, 99), 0);
  // Empty list
  assert.strictEqual(resolveAnchorIndex([], 'a', 0), -1);
}

// 2. Shift: range replaces the selection, in either direction
{
  assert.strictEqual(sorted(computeRangeSelection(paths, 1, 3)), 'b,c,d');
  assert.strictEqual(sorted(computeRangeSelection(paths, 4, 2)), 'c,d,e');
  assert.strictEqual(sorted(computeRangeSelection(paths, 2, 2)), 'c');
}

// 3. Ctrl/Cmd+Shift: range is added to the existing selection
{
  const base = new Set(['a', 'f']);
  const next = computeRangeSelection(paths, 2, 3, base);
  assert.strictEqual(sorted(next), 'a,c,d,f');
  // Base set is not mutated
  assert.strictEqual(sorted(base), 'a,f');
  // Overlap with existing selection
  assert.strictEqual(sorted(computeRangeSelection(paths, 0, 1, new Set(['b', 'e']))), 'a,b,e');
}

// 4. Out-of-range input is clamped; missing anchor selects just the target
{
  assert.strictEqual(sorted(computeRangeSelection(paths, 4, 10)), 'e,f');
  assert.strictEqual(sorted(computeRangeSelection(paths, -1, 3)), 'd');
}

console.log('All range selection tests passed.');

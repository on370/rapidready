import { buildRapidRawList, buildRapidRawListTitle, isListEligible } from './rapidrawList.ts';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}
assert.strictEqual = (a: any, b: any, msg?: string) => {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
};
assert.deepEqual = (a: any, b: any, msg?: string) => {
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(msg || `Expected ${jb}, got ${ja}`);
};

console.log('Testing RapidRAW list builder...');

const visible = [
  { path: 'C:\\p\\a.ARW', name: 'a.ARW' },
  { path: 'C:\\p\\b.jpg', name: 'b.jpg' },
  { path: 'C:\\p\\clip.MP4', name: 'clip.MP4', is_video: true },
  { path: 'C:\\p\\c.CR3', name: 'c.CR3' },
  { path: 'C:\\p\\d.mov', name: 'd.mov' }, // video detected by extension only
  { path: 'C:\\p\\e.NEF', name: 'e.NEF' },
];

// 1. No / single selection -> full visible list in grid order, videos skipped
{
  const r = buildRapidRawList(visible, new Set(), 'C:\\p\\c.CR3');
  assert(r !== null);
  assert.deepEqual(r!.paths, ['C:\\p\\a.ARW', 'C:\\p\\b.jpg', 'C:\\p\\c.CR3', 'C:\\p\\e.NEF']);
  assert.strictEqual(r!.active, 'C:\\p\\c.CR3');
  assert.strictEqual(r!.isSelection, false);

  const r1 = buildRapidRawList(visible, new Set(['C:\\p\\c.CR3']), 'C:\\p\\c.CR3');
  assert.strictEqual(r1!.isSelection, false);
  assert.strictEqual(r1!.paths.length, 4);
}

// 2. Multi-selection -> only selection, in grid order (not selection order)
{
  const sel = new Set(['C:\\p\\e.NEF', 'C:\\p\\a.ARW', 'C:\\p\\clip.MP4']);
  const r = buildRapidRawList(visible, sel, 'C:\\p\\e.NEF');
  assert.deepEqual(r!.paths, ['C:\\p\\a.ARW', 'C:\\p\\e.NEF']);
  assert.strictEqual(r!.active, 'C:\\p\\e.NEF');
  assert.strictEqual(r!.isSelection, true);
}

// 3. Multi-selection where only one eligible photo remains -> full list instead
{
  const sel = new Set(['C:\\p\\a.ARW', 'C:\\p\\clip.MP4']);
  const r = buildRapidRawList(visible, sel, 'C:\\p\\a.ARW');
  assert.strictEqual(r!.isSelection, false);
  assert.strictEqual(r!.paths.length, 4);
}

// 4. Active photo not in the selection -> full list
{
  const sel = new Set(['C:\\p\\a.ARW', 'C:\\p\\b.jpg']);
  const r = buildRapidRawList(visible, sel, 'C:\\p\\e.NEF');
  assert.strictEqual(r!.isSelection, false);
  assert.strictEqual(r!.active, 'C:\\p\\e.NEF');
}

// 5. Active not visible, or a video -> null (caller falls back to a plain open)
{
  assert.strictEqual(buildRapidRawList(visible, new Set(), 'C:\\other\\x.ARW'), null);
  assert.strictEqual(buildRapidRawList(visible, new Set(), 'C:\\p\\clip.MP4'), null);
  assert.strictEqual(buildRapidRawList(visible, new Set(), ''), null);
  assert.strictEqual(buildRapidRawList([], new Set(), 'C:\\p\\a.ARW'), null);
}

// 6. Duplicates and pass-through of unusual paths (e.g. RapidRAW-style ?vc= suffix) are kept as-is
{
  const r = buildRapidRawList(
    [{ path: '/a/x.dng' }, { path: '/a/x.dng' }, { path: '/a/x.dng?vc=2' }],
    new Set(),
    '/a/x.dng?vc=2',
  );
  assert.deepEqual(r!.paths, ['/a/x.dng', '/a/x.dng?vc=2']);
}

// 7. Large list stays fast and correct
{
  const big = Array.from({ length: 10000 }, (_, i) => ({ path: `/p/IMG_${i}.CR3`, name: `IMG_${i}.CR3` }));
  const t0 = Date.now();
  const r = buildRapidRawList(big, new Set(), '/p/IMG_9999.CR3');
  assert.strictEqual(r!.paths.length, 10000);
  assert(Date.now() - t0 < 200, 'building a 10k list should be fast');
}

// 8. Eligibility
{
  assert.strictEqual(isListEligible({ path: '/a/b.ARW' }), true);
  assert.strictEqual(isListEligible({ path: '/a/b.MOV' }), false);
  assert.strictEqual(isListEligible({ path: '/a/b.jpg', is_video: true }), false);
}

console.log('Testing RapidRAW list title...');

const fakeT = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}(${Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(',')})` : key;

{
  const base = {
    scopeName: 'Iceland',
    isSelection: false,
    count: 10,
    filterMode: 'all',
    ratingFilter: null,
    colorFilter: null,
    tagFilter: null,
    sortBy: 'rating',
  };
  assert.strictEqual(buildRapidRawListTitle(fakeT, base), 'Iceland · rapidrawList.sortedBy(field=sort.rating)');
  assert.strictEqual(
    buildRapidRawListTitle(fakeT, { ...base, filterMode: 'picks', colorFilter: 'red', tagFilter: 'bird', manualOrder: true }),
    'Iceland · filters.picks · colors.red · #bird',
  );
  assert.strictEqual(
    buildRapidRawListTitle(fakeT, { ...base, isSelection: true, count: 3, filterMode: 'rated3', sortBy: null }),
    'Iceland · rapidrawList.selection(count=3) · rapidrawList.minStars(count=3)',
  );
  assert.strictEqual(
    buildRapidRawListTitle(fakeT, { ...base, scopeName: null, sortBy: null }),
    'RapidReady',
  );
}

console.log('All RapidRAW list tests passed.');

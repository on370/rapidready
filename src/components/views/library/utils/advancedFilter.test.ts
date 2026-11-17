import type { LibraryImage } from '../../../../stores/libraryStore';
import { collectFilterOptions, EMPTY_ADVANCED_FILTER, matchesAdvancedFilter, activeFilterCount } from './advancedFilter.ts';

// Run with: node src/components/views/library/utils/advancedFilter.test.ts
const assert = {
  equal: (a: unknown, b: unknown, msg?: string) => {
    if (a !== b) throw new Error(`${msg ?? 'equal'}: expected ${String(b)}, got ${String(a)}`);
  },
  deepEqual: (a: unknown, b: unknown, msg?: string) => {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ?? 'deepEqual'}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  },
};

const img = (o: Partial<LibraryImage>): LibraryImage =>
  ({ path: o.name ?? 'x', name: 'x.jpg', size: 1, date: null, camera: null, lens: null, iso: null, aperture: null, shutter: null,
     culling: { flag: null, rating: 0, color: null, tags: [] }, ...o }) as LibraryImage;

const a = img({ name: 'a.ARW', is_raw: true, date: '2023:07:14 10:00:00', camera: 'ILCE-7M4', latitude: 1, longitude: 2 });
const b = img({ name: 'b.jpg', date: '2024-01-02T09:00:00', camera: 'X100V', lens: '23mm' });
const c = img({ name: 'c.mp4', is_video: true, mtime: Date.UTC(2024, 5, 1, 12) / 1000 });
const stack = img({ name: 's.ARW', is_raw: true, stackMembers: [img({ name: 's.ARW', is_raw: true }), img({ name: 's.JPG' })] });
const f = (o: object) => ({ ...EMPTY_ADVANCED_FILTER, ...o });
const names = (filter: object) => [a, b, c, stack].filter((i) => matchesAdvancedFilter(i, f(filter))).map((i) => i.name);

assert.deepEqual(names({}), ['a.ARW', 'b.jpg', 'c.mp4', 's.ARW']);
assert.deepEqual(names({ dateFrom: '2024-01-01', dateTo: '2024-12-31' }), ['b.jpg', 'c.mp4'], 'date range, mtime fallback');
assert.deepEqual(names({ dateTo: '2023-07-14' }), ['a.ARW'], 'inclusive end, undated excluded');
assert.deepEqual(names({ camera: 'X100V' }), ['b.jpg']);
assert.deepEqual(names({ fileType: 'raw' }), ['a.ARW', 's.ARW']);
assert.deepEqual(names({ fileType: 'jpeg' }), ['b.jpg', 's.ARW'], 'stack matches via its JPEG');
assert.deepEqual(names({ fileType: 'video' }), ['c.mp4']);
assert.deepEqual(names({ hasGps: true }), ['a.ARW']);
assert.deepEqual(names({ hasGps: false, fileType: 'raw' }), ['s.ARW']);
assert.equal(activeFilterCount(f({ dateFrom: '2024-01-01', dateTo: '2024-12-31', hasGps: false })), 2);

const opts = collectFilterOptions([a, b, c, b]);
assert.deepEqual(opts.cameras, [{ name: 'X100V', count: 2 }, { name: 'ILCE-7M4', count: 1 }]);
assert.deepEqual(opts.years, ['2024', '2023']);

console.log('advancedFilter tests passed');

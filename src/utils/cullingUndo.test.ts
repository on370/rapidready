import {
  buildCullingStep,
  planRestore,
  restrictStep,
  pushStep,
  inverseDirection,
} from './cullingUndo.ts';
import type { CullingSnapshot, UndoStep, UndoHistory } from './cullingUndo.ts';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}
assert.strictEqual = (a: any, b: any, msg?: string) => {
  if (a !== b) throw new Error(msg || `Expected ${b}, got ${a}`);
};
assert.deepEqual = (a: any, b: any, msg?: string) => {
  const sa = JSON.stringify(a);
  const sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(msg || `Expected ${sb}, got ${sa}`);
};

const snap = (flag: number | null, rating: number, color: string | null = null, tags: string[] = []): CullingSnapshot =>
  ({ flag, rating, color, tags });

console.log('Testing culling undo...');

// 1. Batch rating change keeps each photo's own previous state
{
  const step = buildCullingStep([
    { path: 'a', culling: snap(1, 2) },
    { path: 'b', culling: snap(null, 4, 'red') },
    { path: 'c', culling: snap(-1, 5) },
  ], { rating: 5 });
  assert(step !== null && step.type === 'culling');
  if (step && step.type === 'culling') {
    assert.strictEqual(step.kind, 'rating');
    assert.strictEqual(step.changes.length, 2, 'unchanged photo c is skipped');
    assert.deepEqual(step.changes.map(c => c.before.rating), [2, 4]);
    assert.deepEqual(step.changes.map(c => c.after.rating), [5, 5]);
    assert.strictEqual(step.changes[1].after.color, 'red', 'untouched fields are kept');
  }
}

// 2. No-op change records nothing; duplicates are ignored
{
  assert.strictEqual(buildCullingStep([{ path: 'a', culling: snap(1, 3) }], { flag: 1, rating: 3 }), null);
  const step = buildCullingStep([
    { path: 'a', culling: snap(null, 0) },
    { path: 'a', culling: snap(null, 0) },
  ], { flag: 1 });
  assert(step !== null && step.type === 'culling' && step.changes.length === 1);
}

// 3. Kind detection
{
  const flag = buildCullingStep([{ path: 'a', culling: snap(null, 3) }], { flag: 1, rating: 3 });
  assert.strictEqual(flag?.kind, 'flag');
  const mixed = buildCullingStep([
    { path: 'a', culling: snap(null, 3) },
    { path: 'b', culling: snap(1, 0) },
  ], { flag: 1, rating: 3 });
  assert.strictEqual(mixed?.kind, 'culling');
  const tags = buildCullingStep([{ path: 'a', culling: snap(null, 0, null, ['x']) }], (cur) => ({ tags: [...cur.tags, 'y'] }));
  assert.strictEqual(tags?.kind, 'tags');
}

// 4. Restore plan groups identical patches and only touches changed fields
{
  const step = buildCullingStep([
    { path: 'a', culling: snap(1, 2) },
    { path: 'b', culling: snap(null, 2) },
    { path: 'c', culling: snap(-1, 4) },
  ], { rating: 0 });
  if (!step || step.type !== 'culling') throw new Error('expected culling step');
  const undo = planRestore(step.changes, 'before');
  assert.strictEqual(undo.length, 2);
  assert.deepEqual(undo[0], { paths: ['a', 'b'], patch: { rating: 2 } });
  assert.deepEqual(undo[1], { paths: ['c'], patch: { rating: 4 } });
  const redo = planRestore(step.changes, 'after');
  assert.deepEqual(redo, [{ paths: ['a', 'b', 'c'], patch: { rating: 0 } }]);
}

// 5. Flag/color clear values survive as null
{
  const step = buildCullingStep([
    { path: 'a', culling: snap(null, 0, null) },
    { path: 'b', culling: snap(1, 0, 'blue') },
  ], { flag: -1, color: 'red' });
  if (!step || step.type !== 'culling') throw new Error('expected culling step');
  const undo = planRestore(step.changes, 'before');
  assert.deepEqual(undo[0].patch, { flag: null, color: null });
  assert.deepEqual(undo[1].patch, { flag: 1, color: 'blue' });
}

// 6. Tag restores are per photo with the full target state
{
  const step = buildCullingStep([
    { path: 'a', culling: snap(1, 3, null, ['x']) },
    { path: 'b', culling: snap(null, 0, null, ['y', 'x']) },
  ], (cur) => ({ tags: cur.tags.filter(t => t !== 'x') }));
  if (!step || step.type !== 'culling') throw new Error('expected culling step');
  const undo = planRestore(step.changes, 'before');
  assert.strictEqual(undo.length, 2);
  assert.deepEqual(undo[0].full, snap(1, 3, null, ['x']));
  assert.deepEqual(undo[1].patch, { tags: ['y', 'x'] });
}

// 7. restrictStep drops unloaded photos
{
  const step = buildCullingStep([
    { path: 'a', culling: snap(null, 0) },
    { path: 'b', culling: snap(null, 0) },
  ], { rating: 3 }) as UndoStep;
  const r = restrictStep(step, p => p === 'b');
  assert(r !== null && r.type === 'culling' && r.changes.length === 1 && r.changes[0].path === 'b');
  assert.strictEqual(restrictStep(step, () => false), null);
  const rot: UndoStep = { type: 'rotation', kind: 'rotation', paths: ['a', 'b'], direction: 'cw' };
  const rr = restrictStep(rot, p => p === 'a');
  assert(rr !== null && rr.type === 'rotation' && rr.paths.length === 1);
  assert.strictEqual(inverseDirection('cw'), 'ccw');
  assert.strictEqual(inverseDirection('ccw'), 'cw');
}

// 8. History is bounded and a new action clears redo
{
  let h: UndoHistory = { past: [], future: [] };
  const mk = (n: number): UndoStep => ({ type: 'rotation', kind: 'rotation', paths: [String(n)], direction: 'cw' });
  for (let i = 0; i < 5; i++) h = pushStep(h, mk(i), 3);
  assert.deepEqual(h.past.map(s => s.type === 'rotation' ? s.paths[0] : ''), ['2', '3', '4']);
  h = { past: h.past, future: [mk(9)] };
  h = pushStep(h, mk(10), 3);
  assert.strictEqual(h.future.length, 0);
}

console.log('All culling undo tests passed.');

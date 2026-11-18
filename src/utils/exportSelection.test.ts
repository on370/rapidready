import { collectSelectionForExport } from './exportSelection.ts';

function assert(condition: boolean, msg?: string) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}
function assertArrayEqual(actual: string[], expected: string[], msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg || 'Arrays differ'}: expected ${e}, got ${a}`);
}

console.log('Testing collectSelectionForExport...');

const grid = [
  { path: 'C:\\Photos\\a.jpg' },
  {
    path: 'C:\\Photos\\b.CR3',
    stackMembers: [{ path: 'C:\\Photos\\b.CR3' }, { path: 'C:\\Photos\\b.JPG' }],
  },
  { path: 'C:\\Photos\\c.jpg' },
  { path: 'C:\\Photos\\d.jpg' },
];

// 1. Grid order wins over selection order
{
  const r = collectSelectionForExport(grid, ['C:\\Photos\\d.jpg', 'C:\\Photos\\a.jpg'], { expandStacks: true });
  assertArrayEqual(r, ['C:\\Photos\\a.jpg', 'C:\\Photos\\d.jpg'], 'grid order');
}

// 2. Stack members are included right after their representative
{
  const r = collectSelectionForExport(grid, ['C:\\Photos\\c.jpg', 'C:\\Photos\\b.CR3'], { expandStacks: true });
  assertArrayEqual(r, ['C:\\Photos\\b.CR3', 'C:\\Photos\\b.JPG', 'C:\\Photos\\c.jpg'], 'stack expansion');
}

// 3. No expansion when stacking is off
{
  const r = collectSelectionForExport(grid, ['C:\\Photos\\b.CR3'], { expandStacks: false });
  assertArrayEqual(r, ['C:\\Photos\\b.CR3'], 'no expansion');
}

// 4. Path comparison is slash/case-insensitive and de-duplicates
{
  const r = collectSelectionForExport(grid, ['c:/photos/A.JPG', 'C:\\Photos\\a.jpg'], { expandStacks: true });
  assertArrayEqual(r, ['C:\\Photos\\a.jpg'], 'normalized matching');
}

// 5. Selected paths missing from the grid are appended, not dropped
{
  const r = collectSelectionForExport(grid, ['C:\\Other\\x.jpg', 'C:\\Photos\\c.jpg'], { expandStacks: true });
  assertArrayEqual(r, ['C:\\Photos\\c.jpg', 'C:\\Other\\x.jpg'], 'fallback append');
}

// 6. Empty selection
{
  const r = collectSelectionForExport(grid, [], { expandStacks: true });
  assert(r.length === 0, 'empty selection');
}

console.log('All exportSelection tests passed.');

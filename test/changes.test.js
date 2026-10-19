/**
 * changes.test.js — diffEntries() marks re-imported rows as added /
 * modified / unchanged and counts removals, including duplicate keys.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { diffEntries } = require('../src/features/laborops/changes');

const row = (code, tsid, totTime, extra = {}) => ({ fullLaborOpCode: code, tsid, qualDesc: null, categoryCode: 'BX', totTime, ...extra });
const NOW = '2026-10-19T10:00:00.000Z';

test('first import of a vehicle: every row is added', () => {
  const rows = [row('A', 1, 0.5), row('B', 2, 1.0)];
  const c = diffEntries([], rows, NOW);
  assert.deepEqual(c, { added: 2, modified: 0, removed: 0, unchanged: 0 });
  assert.equal(rows[0].changeType, 'added');
  assert.equal(rows[0].changedAt, NOW);
  assert.equal(rows[0].prevTotTime, null);
});

test('re-import: unchanged, modified with previous time, added, removed', () => {
  const old = [row('A', 1, 0.5), row('B', 2, 1.0), row('C', 3, 2.0)];
  const rows = [row('A', 1, 0.5), row('B', 2, 1.2), row('D', 4, 0.3)];
  const c = diffEntries(old, rows, NOW);
  assert.deepEqual(c, { added: 1, modified: 1, removed: 1, unchanged: 1 });
  assert.equal(rows[0].changeType, null);
  assert.equal(rows[1].changeType, 'modified');
  assert.equal(rows[1].prevTotTime, 1.0);
  assert.equal(rows[1].changedAt, NOW);
  assert.equal(rows[2].changeType, 'added');
});

test('tsid or qualifier differences make distinct entries', () => {
  const old = [row('A', 1, 0.5), row('A', 2, 0.7)];
  const rows = [row('A', 1, 0.5), row('A', 2, 0.9), row('A', 1, 0.5, { qualDesc: 'with AC' })];
  const c = diffEntries(old, rows, NOW);
  assert.deepEqual(c, { added: 1, modified: 1, removed: 0, unchanged: 1 });
});

test('duplicate keys are matched as a multiset so counts add up', () => {
  // Two identical old rows (same code/tsid/qualifier), one of which changes.
  const old = [row('A', 1, 0.5), row('A', 1, 0.5)];
  const rows = [row('A', 1, 0.5), row('A', 1, 0.8)];
  const c = diffEntries(old, rows, NOW);
  assert.deepEqual(c, { added: 0, modified: 1, removed: 0, unchanged: 1 });
  // And if the new file has fewer duplicates, the extra old one counts as removed.
  const c2 = diffEntries([row('A', 1, 0.5), row('A', 1, 0.5)], [row('A', 1, 0.5)], NOW);
  assert.deepEqual(c2, { added: 0, modified: 0, removed: 1, unchanged: 1 });
});

test('float noise is not a modification; null times compare sensibly', () => {
  assert.deepEqual(diffEntries([row('A', 1, 0.1 + 0.2)], [row('A', 1, 0.3)], NOW), { added: 0, modified: 0, removed: 0, unchanged: 1 });
  assert.deepEqual(diffEntries([row('A', 1, null)], [row('A', 1, null)], NOW), { added: 0, modified: 0, removed: 0, unchanged: 1 });
  assert.deepEqual(diffEntries([row('A', 1, null)], [row('A', 1, 0.4)], NOW).modified, 1);
});

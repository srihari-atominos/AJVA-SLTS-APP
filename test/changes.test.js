/**
 * changes.test.js — diffEntries() marks re-imported rows as added /
 * modified / unchanged, counts removals, handles duplicate keys, and
 * carries recent markers across later uploads for the highlight window.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { diffEntries } = require('../src/features/laborops/changes');

const row = (code, tsid, totTime, extra = {}) => ({ fullLaborOpCode: code, tsid, qualDesc: null, categoryCode: 'BX', totTime, ...extra });
const NOW = '2026-10-19T10:00:00.000Z';
const CUTOFF = '2026-10-12T10:00:00.000Z'; // NOW - 7 days
const RECENT = '2026-10-17T09:00:00.000Z'; // inside the window
const STALE = '2026-10-01T09:00:00.000Z';  // outside the window

test('first import of a vehicle: every row is added', () => {
  const rows = [row('A', 1, 0.5), row('B', 2, 1.0)];
  const c = diffEntries([], rows, NOW, CUTOFF);
  assert.deepEqual(c, { added: 2, modified: 0, removed: 0, unchanged: 0 });
  assert.equal(rows[0].changeType, 'added');
  assert.equal(rows[0].changedAt, NOW);
  assert.equal(rows[0].prevTotTime, null);
});

test('re-import: unchanged, modified with previous time, added, removed', () => {
  const old = [row('A', 1, 0.5), row('B', 2, 1.0), row('C', 3, 2.0)];
  const rows = [row('A', 1, 0.5), row('B', 2, 1.2), row('D', 4, 0.3)];
  const c = diffEntries(old, rows, NOW, CUTOFF);
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
  const c = diffEntries(old, rows, NOW, CUTOFF);
  assert.deepEqual(c, { added: 1, modified: 1, removed: 0, unchanged: 1 });
});

test('duplicate keys are matched as a multiset so counts add up', () => {
  const old = [row('A', 1, 0.5), row('A', 1, 0.5)];
  const rows = [row('A', 1, 0.5), row('A', 1, 0.8)];
  assert.deepEqual(diffEntries(old, rows, NOW, CUTOFF), { added: 0, modified: 1, removed: 0, unchanged: 1 });
  assert.deepEqual(diffEntries([row('A', 1, 0.5), row('A', 1, 0.5)], [row('A', 1, 0.5)], NOW, CUTOFF),
    { added: 0, modified: 0, removed: 1, unchanged: 1 });
});

test('float noise is not a modification; null times compare sensibly', () => {
  assert.deepEqual(diffEntries([row('A', 1, 0.1 + 0.2)], [row('A', 1, 0.3)], NOW, CUTOFF), { added: 0, modified: 0, removed: 0, unchanged: 1 });
  assert.deepEqual(diffEntries([row('A', 1, null)], [row('A', 1, null)], NOW, CUTOFF), { added: 0, modified: 0, removed: 0, unchanged: 1 });
  assert.equal(diffEntries([row('A', 1, null)], [row('A', 1, 0.4)], NOW, CUTOFF).modified, 1);
});

test('a recent marker survives a later upload that leaves the row unchanged', () => {
  const old = [
    row('A', 1, 0.9, { changeType: 'modified', prevTotTime: 0.5, changedAt: RECENT }),
    row('B', 2, 1.0, { changeType: 'added', prevTotTime: null, changedAt: RECENT }),
  ];
  const rows = [row('A', 1, 0.9), row('B', 2, 1.0)];
  const c = diffEntries(old, rows, NOW, CUTOFF);
  assert.deepEqual(c, { added: 0, modified: 0, removed: 0, unchanged: 2 }); // nothing changed in THIS import
  assert.equal(rows[0].changeType, 'modified');   // ...but the ribbon stays
  assert.equal(rows[0].prevTotTime, 0.5);
  assert.equal(rows[0].changedAt, RECENT);         // original change time, not now
  assert.equal(rows[1].changeType, 'added');
});

test('a stale marker (older than the window) is dropped on the next upload', () => {
  const old = [row('A', 1, 0.9, { changeType: 'modified', prevTotTime: 0.5, changedAt: STALE })];
  const rows = [row('A', 1, 0.9)];
  diffEntries(old, rows, NOW, CUTOFF);
  assert.equal(rows[0].changeType, null);
  assert.equal(rows[0].prevTotTime, null);
});

test('a second recent change keeps the ORIGINAL previous time', () => {
  const old = [row('A', 1, 0.9, { changeType: 'modified', prevTotTime: 0.5, changedAt: RECENT })];
  const rows = [row('A', 1, 1.4)];
  diffEntries(old, rows, NOW, CUTOFF);
  assert.equal(rows[0].changeType, 'modified');
  assert.equal(rows[0].prevTotTime, 0.5); // not 0.9
  assert.equal(rows[0].changedAt, NOW);
});

test('without a cutoff every existing marker is carried over', () => {
  const old = [row('A', 1, 0.9, { changeType: 'added', prevTotTime: null, changedAt: STALE })];
  const rows = [row('A', 1, 0.9)];
  diffEntries(old, rows, NOW, null);
  assert.equal(rows[0].changeType, 'added');
});

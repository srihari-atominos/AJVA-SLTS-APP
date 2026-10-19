/**
 * changes.js
 * Pure diff of a vehicle's labor-time entries between what is in the
 * database now and what a re-uploaded extract contains, so every row can
 * carry a "what happened to me in the last update" marker:
 *
 *   changeType  'added'     entry not present before
 *               'modified'  same entry, different time (prevTotTime = old value)
 *               null        unchanged
 *   changedAt   ISO timestamp of the update that set the marker
 *
 * An entry is identified by fullLaborOpCode + tsid + qualDesc +
 * categoryCode. That is unique for 99.95% of rows; the few genuine
 * duplicates (same code, several identical qualifiers) are handled as a
 * multiset — each old row can be matched by at most one new row, so the
 * counts always add up: unchanged + modified + added = new rows, and
 * unchanged + modified + removed = old rows.
 *
 * Mutates `newRows` in place (sets changeType / prevTotTime / changedAt)
 * and returns the counts. No I/O — see test/changes.test.js.
 */
const entryKey = (r) => [r.fullLaborOpCode ?? '', String(r.tsid ?? ''), r.qualDesc ?? '', r.categoryCode ?? ''].join('|');

const sameTime = (a, b) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-9;
};

/**
 * @param {Array<{fullLaborOpCode, tsid, qualDesc, categoryCode, totTime}>} oldRows  rows currently stored (may be empty)
 * @param {Array<object>} newRows  rows parsed from the new extract — annotated in place
 * @param {string} now  ISO timestamp to stamp on changed rows
 * @returns {{added:number, modified:number, removed:number, unchanged:number}}
 */
function diffEntries(oldRows, newRows, now) {
  const pool = new Map(); // key -> [old totTime, ...] still unmatched
  for (const o of oldRows) {
    const k = entryKey(o);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(o.totTime);
  }

  let added = 0, modified = 0, unchanged = 0;
  for (const r of newRows) {
    const olds = pool.get(entryKey(r));
    r.changeType = null;
    r.prevTotTime = null;
    r.changedAt = null;

    if (!olds || olds.length === 0) {
      r.changeType = 'added';
      r.changedAt = now;
      added++;
      continue;
    }
    // Prefer an exact time match (unchanged); otherwise consume one old
    // value and report the row as modified from it.
    const i = olds.findIndex((t) => sameTime(t, r.totTime));
    if (i >= 0) {
      olds.splice(i, 1);
      unchanged++;
    } else {
      r.changeType = 'modified';
      r.prevTotTime = olds.shift() ?? null;
      r.changedAt = now;
      modified++;
    }
  }

  let removed = 0;
  for (const olds of pool.values()) removed += olds.length;

  return { added, modified, removed, unchanged };
}

module.exports = { diffEntries, entryKey };

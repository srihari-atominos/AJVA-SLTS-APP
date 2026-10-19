/**
 * changes.js
 * Pure diff of a vehicle's labor-time entries between what is in the
 * database now and what a re-uploaded extract contains, so every row can
 * carry a "what happened to me recently" marker:
 *
 *   changeType  'added'     entry not present before
 *               'modified'  same entry, different time (prevTotTime = value before the change)
 *               null        unchanged
 *   changedAt   ISO timestamp of the upload/edit that set the marker
 *
 * Markers are TIME-BASED, not "since the last upload": extracts arrive
 * file by file over days, so a ribbon set on Monday must still show on
 * Thursday even if that vehicle (or any other) was uploaded again in
 * between. Therefore an unchanged row keeps its existing marker as long
 * as it is younger than `cutoffIso` (now minus CHANGE_HIGHLIGHT_DAYS); a
 * row that changes again keeps the ORIGINAL previous time it had before
 * the first recent change, so "was 0.5, now 0.9" survives two edits.
 *
 * An entry is identified by fullLaborOpCode + tsid + qualDesc +
 * categoryCode. That is unique for 99.95% of rows; the few genuine
 * duplicates are handled as a multiset — each old row can be matched by
 * at most one new row, so the counts always add up:
 *   unchanged + modified + added   = new rows
 *   unchanged + modified + removed = old rows
 *
 * Mutates `newRows` in place and returns the counts. No I/O — see
 * test/changes.test.js.
 */
const entryKey = (r) => [r.fullLaborOpCode ?? '', String(r.tsid ?? ''), r.qualDesc ?? '', r.categoryCode ?? ''].join('|');

const sameTime = (a, b) => {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) < 1e-9;
};

/** Does this old row carry a marker that is still inside the highlight window? */
const hasFreshMarker = (old, cutoffIso) =>
  !!old.changeType && !!old.changedAt && (!cutoffIso || old.changedAt >= cutoffIso);

/**
 * @param {Array<object>} oldRows  rows currently stored: fullLaborOpCode, tsid, qualDesc,
 *   categoryCode, totTime and (optionally) changeType, prevTotTime, changedAt
 * @param {Array<object>} newRows  rows parsed from the new extract — annotated in place
 * @param {string} now  ISO timestamp to stamp on rows changed by THIS import
 * @param {string|null} [cutoffIso]  markers older than this are not carried over (null = always carry)
 * @returns {{added:number, modified:number, removed:number, unchanged:number}}
 */
function diffEntries(oldRows, newRows, now, cutoffIso = null) {
  const pool = new Map(); // key -> [old row, ...] still unmatched
  for (const o of oldRows) {
    const k = entryKey(o);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(o);
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

    // Prefer an exact time match (unchanged, marker carried over if still
    // fresh); otherwise consume one old row and report a modification.
    const i = olds.findIndex((o) => sameTime(o.totTime, r.totTime));
    if (i >= 0) {
      const [old] = olds.splice(i, 1);
      if (hasFreshMarker(old, cutoffIso)) {
        r.changeType = old.changeType;
        r.prevTotTime = old.prevTotTime ?? null;
        r.changedAt = old.changedAt;
      }
      unchanged++;
    } else {
      const old = olds.shift();
      r.changeType = 'modified';
      r.prevTotTime = (old.changeType === 'modified' && old.prevTotTime != null && hasFreshMarker(old, cutoffIso))
        ? old.prevTotTime   // keep the value from before the FIRST recent change
        : old.totTime;
      r.changedAt = now;
      modified++;
    }
  }

  let removed = 0;
  for (const olds of pool.values()) removed += olds.length;

  return { added, modified, removed, unchanged };
}

module.exports = { diffEntries, entryKey };

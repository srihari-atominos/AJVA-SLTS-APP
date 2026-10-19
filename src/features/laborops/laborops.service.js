/**
 * laborops.service.js
 * Business logic for labor-time rows: paginated/filtered listing, CSV
 * export, exact-code lookup, and the single-field (totTime-only) edit with
 * its validation bound. Also exposes insertMany/getCount for other
 * features (vehicles' upload, stats) to call.
 *
 * insertMany(rows, dbCtx): dbCtx is optional — pass vehicles.service.js's
 * active transaction context when inserting an uploaded extract's rows (so
 * they commit/roll back together with the vehicle row), or omit it for any
 * other caller, which writes through the main pool. Building a fresh
 * repository bound to whatever context is given is why this file takes
 * `db` (not a pre-built repo) — see makeVehiclesRepository's header
 * comment in the vehicles feature for the same pattern.
 */
const { makeLaborOpsRepository } = require('./laborops.repository');
const { diffEntries } = require('./changes');
const config = require('../../config');

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

/** ISO timestamp of "now minus the highlight window" — markers older than this are hidden. */
function changeCutoffIso() {
  return new Date(Date.now() - config.laborTime.changeHighlightDays * 24 * 60 * 60 * 1000).toISOString();
}

function parseFilters(query) {
  const change = ['added', 'modified', 'any'].includes(query.change) ? query.change : null;
  return {
    vehKey: query.vehKey || null,
    modYear: query.modYear || null,
    gsa: query.gsa || null,
    q: query.q || null,
    exact: query.exact === 'true' || query.exact === '1',
    change,
    changeSince: change ? changeCutoffIso() : null,
  };
}

const EXPORT_COLUMNS = [
  'vehKey', 'vehDesc', 'modYear', 'gsa', 'source', 'brandCode',
  'laborDescCode', 'fullLaborOpCode', 'operationDesc', 'categoryCode',
  'catDesc', 'qualDesc', 'totTime', 'secNo', 'secDesc',
  'effectiveDate', 'status', 'assessedTime', 'tsid',
  'changeType', 'prevTotTime', 'changedAt',
];

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function makeLaborOpsService(db, auditService) {
  const repo = makeLaborOpsRepository(db);

  function getCount() {
    return repo.countAll();
  }

  /** Used by vehicles.service.js when importing an uploaded extract's labor-time rows. */
  async function insertMany(rows, dbCtx) {
    const targetRepo = dbCtx ? makeLaborOpsRepository(dbCtx) : repo;
    for (const row of rows) await targetRepo.insertOne(row);
  }

  /**
   * Used by vehicles.service.js BEFORE it replaces a vehicle's rows: marks
   * each parsed row as added / modified / unchanged relative to what the
   * vehicle has in the database right now, and returns the counts. For a
   * vehicle that doesn't exist yet every row is 'added'.
   */
  async function markChanges(vehKey, rows, dbCtx) {
    const targetRepo = dbCtx ? makeLaborOpsRepository(dbCtx) : repo;
    const existing = await targetRepo.listEntriesForVehicle(vehKey);
    // Markers younger than the window are carried over onto unchanged rows,
    // so a ribbon set by an earlier upload keeps showing for its full 7 days.
    return diffEntries(existing, rows, new Date().toISOString(), changeCutoffIso());
  }

  async function listPage(query) {
    const filters = parseFilters(query);
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(query.limit) || 50));
    const [total, rows] = await Promise.all([
      repo.countFiltered(filters),
      repo.listPage(filters, limit, (page - 1) * limit),
    ]);
    return { total, page, limit, rows };
  }

  async function exportCsvRows(query) {
    const filters = parseFilters(query);
    const rows = await repo.listAllMatching(filters);
    return { columns: EXPORT_COLUMNS, rows, csvEscape };
  }

  async function lookup(code, vehKey) {
    if (!code) throw httpError('code query param required', 400);
    const rows = await repo.lookupByCode(code.trim().toUpperCase(), vehKey || null);
    return { count: rows.length, rows };
  }

  // The ONLY per-row write exposed: totTime, and only totTime. Every other
  // column (codes, description, vehicle, section, etc.) comes exclusively
  // from an uploaded XML extract, never a manual edit.
  async function editTotTime(id, totTime, user) {
    if (!Number.isInteger(id)) throw httpError('Invalid id', 400);
    const n = Number(totTime);
    const maxHours = config.laborTime.maxHours;
    if (!Number.isFinite(n) || n < 0 || n > maxHours) {
      throw httpError(`totTime must be a number between 0 and ${maxHours}`, 400);
    }
    const before = await repo.findFullById(id);
    if (!before) throw httpError('Labor-time row not found', 404);
    // Keep the ORIGINAL value if the row was already marked modified
    // within the highlight window, so "was 0.5, now 0.9" survives a second
    // edit rather than collapsing to the intermediate value.
    const recentlyModified = before.changeType === 'modified' && before.prevTotTime != null
      && before.changedAt && before.changedAt >= changeCutoffIso();
    const prev = recentlyModified ? before.prevTotTime : before.totTime;
    await repo.updateTotTime(id, n, prev, new Date().toISOString());
    if (auditService) {
      await auditService.record({
        action: 'edit', mode: 'edited', rowsModified: 1,
        vehKey: before.vehKey, vehDesc: before.vehDesc,
        details: `${before.fullLaborOpCode} (${before.operationDesc}): time ${before.totTime} -> ${n} hrs`,
      }, user);
    }
    return repo.findFullById(id);
  }

  return { getCount, insertMany, markChanges, listPage, exportCsvRows, lookup, editTotTime };
}

module.exports = { makeLaborOpsService };

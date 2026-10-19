/**
 * audit.service.js
 * Records who changed the warranty data, when, and by how much, and serves
 * the log back. `record()` is called by the vehicles (import/delete) and
 * laborops (edit) services — the composition happens in app.js, which
 * hands this service to those routers, so no feature reaches into another
 * feature's repository.
 *
 * Recording never throws into the caller: a failed audit write is logged
 * and swallowed, so an import that succeeded is still reported as such.
 */
const { makeAuditRepository } = require('./audit.repository');

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

function makeAuditService(db) {
  const repo = makeAuditRepository(db);

  /**
   * @param {object} event  { action, mode, fileName, vehKey, vehDesc, rowsAdded, rowsRemoved, details }
   * @param {object} user   req.user (id, email) — whoever performed it
   * @param {object} [tx]   transaction-scoped dbContext, when the write must
   *                        commit/roll back with the data change itself
   */
  async function record(event, user, tx) {
    const entry = {
      at: new Date().toISOString(),
      userId: user ? user.id : null,
      userEmail: user ? user.email : null,
      ...event,
    };
    try {
      await makeAuditRepository(tx || db).insert(entry);
    } catch (err) {
      console.error('[audit] failed to record event', entry, err);
    }
    return entry;
  }

  async function list(query = {}) {
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(query.limit, 10) || PAGE_SIZE_DEFAULT));
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const [total, rows] = await Promise.all([repo.count(), repo.listPage(limit, (page - 1) * limit)]);
    return { total, page, limit, rows };
  }

  /** Latest successful data change, for the "last updated" line every user sees. */
  async function lastUpdated() {
    const row = await repo.latestChange();
    if (!row) return null;
    return {
      at: row.at, userEmail: row.userEmail, action: row.action, mode: row.mode,
      fileName: row.fileName, vehDesc: row.vehDesc,
      rowsAdded: row.rowsAdded, rowsModified: row.rowsModified, rowsRemoved: row.rowsRemoved,
    };
  }

  return { record, list, lastUpdated };
}

module.exports = { makeAuditService };

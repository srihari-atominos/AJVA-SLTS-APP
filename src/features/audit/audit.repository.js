/**
 * audit.repository.js
 * All direct SQL for audit_log, via the uniform dbContext. Pagination is
 * the one dialect-specific query (same LIMIT/OFFSET vs OFFSET/FETCH split
 * as laborops.repository.js).
 */
const COLUMNS = 'id, at, userId, userEmail, action, mode, fileName, vehKey, vehDesc, rowsAdded, rowsRemoved, details';

function makeAuditRepository(db) {
  return {
    insert: (e) => db.insert(
      `INSERT INTO audit_log (at, userId, userEmail, action, mode, fileName, vehKey, vehDesc, rowsAdded, rowsRemoved, details)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [e.at, e.userId ?? null, e.userEmail ?? null, e.action, e.mode ?? null, e.fileName ?? null,
       e.vehKey ?? null, e.vehDesc ?? null, e.rowsAdded ?? 0, e.rowsRemoved ?? 0, e.details ?? null]
    ),

    count: async () => (await db.get('SELECT COUNT(*) AS n FROM audit_log', [])).n,

    listPage(limit, offset) {
      if (db.driver === 'mssql') {
        return db.all(`SELECT ${COLUMNS} FROM audit_log ORDER BY id DESC OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`, [offset, limit]);
      }
      return db.all(`SELECT ${COLUMNS} FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?`, [limit, offset]);
    },

    // Most recent event that actually changed data (a failed import didn't).
    latestChange() {
      const sql = db.driver === 'mssql'
        ? `SELECT TOP 1 ${COLUMNS} FROM audit_log WHERE mode <> 'failed' ORDER BY id DESC`
        : `SELECT ${COLUMNS} FROM audit_log WHERE mode <> 'failed' ORDER BY id DESC LIMIT 1`;
      return db.get(sql, []);
    },
  };
}

module.exports = { makeAuditRepository };

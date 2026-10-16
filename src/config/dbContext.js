/**
 * dbContext.js
 * A uniform, awaitable query interface over either driver — SQLite
 * (node:sqlite, local dev / small deployments) or MSSQL (mssql package,
 * production on-prem). Repositories write ONE version of their SQL, using
 * plain `?` positional placeholders exactly like the original SQLite-only
 * code did; this module is the only place that knows the two drivers
 * actually bind parameters differently (MSSQL needs named `@p0, @p1, ...`).
 *
 * Interface (every method returns a Promise, even for SQLite, so calling
 * code never has to branch on which driver is active):
 *   all(sql, params)     -> rows[]
 *   get(sql, params)     -> row | undefined
 *   run(sql, params)     -> { changes }                 (UPDATE/DELETE, or INSERT you don't need the id for)
 *   insert(sql, params)  -> { id }                       (INSERT where you need the generated id back)
 *   transaction(fn)       -> runs fn(tx) — tx has the same all/get/run/insert — committing on
 *                            success, rolling back if fn throws; every statement inside shares
 *                            one connection, so multi-table writes (e.g. a vehicle upload's
 *                            vehicle+laborops rows) stay atomic exactly like the original
 *                            BEGIN/COMMIT/ROLLBACK pattern did.
 *
 * `insert()` requires the SQL to be a plain INSERT with no id-returning
 * clause of its own — this module appends the right one per driver
 * (`SELECT last_insert_rowid()` / `SELECT SCOPE_IDENTITY() AS id`).
 */
const { DatabaseSync } = require('node:sqlite');
const sql = require('mssql');

// ---- SQLite implementation (synchronous under the hood, async interface) ----
function makeSqliteContext(db) {
  async function all(sqlText, params = []) {
    return db.prepare(sqlText).all(...params);
  }
  async function get(sqlText, params = []) {
    return db.prepare(sqlText).get(...params);
  }
  async function run(sqlText, params = []) {
    const r = db.prepare(sqlText).run(...params);
    return { changes: r.changes };
  }
  async function insert(sqlText, params = []) {
    const r = db.prepare(sqlText).run(...params);
    return { id: Number(r.lastInsertRowid) };
  }
  async function transaction(fn) {
    db.exec('BEGIN');
    try {
      const result = await fn({ driver: 'sqlite', all, get, run, insert });
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  return { driver: 'sqlite', all, get, run, insert, transaction, raw: db };
}

// ---- MSSQL implementation ----
// Translates "?" positional placeholders (as written in every repository,
// identically to the SQLite version) into MSSQL's required "@p0, @p1, ..."
// named parameters, so repository SQL text doesn't need a driver branch
// for ordinary CRUD. Pagination (OFFSET/FETCH vs LIMIT/OFFSET) and a few
// other genuinely dialect-specific statements are still written per-driver
// at the call site — see each repository for where that happens.
function toNamedParams(sqlText, params) {
  let i = 0;
  const text = sqlText.replace(/\?/g, () => `@p${i++}`);
  if (i !== params.length) {
    throw new Error(`Parameter count mismatch: SQL has ${i} placeholders, got ${params.length} params`);
  }
  return text;
}

function makeMssqlContext(pool) {
  function buildRequest(requestFactory, params) {
    const request = requestFactory();
    params.forEach((v, idx) => request.input(`p${idx}`, v === undefined ? null : v));
    return request;
  }

  function makeOps(requestFactory) {
    async function all(sqlText, params = []) {
      const text = toNamedParams(sqlText, params);
      const result = await buildRequest(requestFactory, params).query(text);
      return result.recordset || [];
    }
    async function get(sqlText, params = []) {
      const rows = await all(sqlText, params);
      return rows[0];
    }
    async function run(sqlText, params = []) {
      const text = toNamedParams(sqlText, params);
      const result = await buildRequest(requestFactory, params).query(text);
      return { changes: result.rowsAffected ? result.rowsAffected[0] : 0 };
    }
    async function insert(sqlText, params = []) {
      const text = toNamedParams(sqlText, params) + '; SELECT SCOPE_IDENTITY() AS id;';
      const result = await buildRequest(requestFactory, params).query(text);
      const row = (result.recordset && result.recordset[0]) || {};
      return { id: Number(row.id) };
    }
    return { all, get, run, insert };
  }

  const poolOps = makeOps(() => pool.request());

  async function transaction(fn) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const txOps = { driver: 'mssql', ...makeOps(() => new sql.Request(tx)) };
      const result = await fn(txOps);
      await tx.commit();
      return result;
    } catch (e) {
      try { await tx.rollback(); } catch { /* connection may already be gone; surface the original error */ }
      throw e;
    }
  }

  return { driver: 'mssql', ...poolOps, transaction, raw: pool };
}

module.exports = { makeSqliteContext, makeMssqlContext };

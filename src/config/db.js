/**
 * db.js
 * Creates the app's one shared database connection — SQLite or MSSQL,
 * picked by config.db.driver — wraps it in the uniform dbContext (see
 * dbContext.js), and ensures the users/sessions schema exists. Every
 * feature's repository is built from the returned context, never a raw
 * driver handle, so a feature's SQL only ever talks to this interface.
 *
 * The warranty data tables (vehicles/laborops/etc.) are NOT created here —
 * they come from the separate `npm run import` batch step (import-sqlite.js
 * or import-mssql.js), since they're bulk-loaded from a converted XML
 * export, not something the live app creates from scratch.
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const sql = require('mssql');
const config = require('./index');
const { makeSqliteContext, makeMssqlContext } = require('./dbContext');
const { ensureUsersSchema } = require('../features/users/schema');
const { ensureUsersSchemaMssql } = require('../features/users/schema.mssql');

async function createDb() {
  if (config.db.driver === 'mssql') {
    const m = config.db.mssql;
    const pool = await sql.connect({
      server: m.host,
      port: m.port,
      user: m.user,
      password: m.password,
      database: m.database,
      options: { encrypt: m.encrypt, trustServerCertificate: m.trustServerCertificate },
    });
    const ctx = makeMssqlContext(pool);
    await ensureUsersSchemaMssql(ctx);
    console.log(`[db] Connected to MSSQL ${m.host}:${m.port}/${m.database}`);
    return ctx;
  }

  const dbPath = path.join(config.dataDir, 'warranty.db');
  const raw = new DatabaseSync(dbPath);
  raw.exec('PRAGMA journal_mode = WAL;');
  const ctx = makeSqliteContext(raw);
  ensureUsersSchema(raw); // sqlite schema setup is still synchronous DDL on the raw handle
  console.log(`[db] Using SQLite at ${dbPath}`);
  return ctx;
}

module.exports = { createDb };

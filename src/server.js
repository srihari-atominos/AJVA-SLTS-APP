/**
 * server.js
 * Entry point: creates the shared DB connection (SQLite or MSSQL, per
 * config.db.driver), creates any missing warranty data tables, seeds the
 * Super Admin from .env if configured, assembles the app, and starts
 * listening.
 */
const config = require('./config');
const { createDb } = require('./config/db');
const { createApp } = require('./app');
const { seedSuperAdminFromEnv } = require('./features/users/superAdmin');
const { ensureWarrantySchema, addMissingColumns, findMissingColumns, upgradeSqlFor } = require('./features/vehicles/dataSchema');
const { ensureAuditSchema } = require('./features/audit/schema');
const { ensureVinSchema } = require('./features/vin/schema');

// Defense in depth: every route handler is already wrapped in asyncHandler
// (see its header comment), which is the real fix for a rejected request
// promise crashing the process. This is only a last-resort net for a
// rejection outside the request cycle — log it and keep serving, rather
// than taking the whole app down over one transient DB hiccup.
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

(async () => {
  const db = await createDb();

  // Warranty data tables: create if missing (empty). A no-op against a
  // database that already has them, so this is safe on every restart. Data
  // is loaded afterwards through the app's XML upload (POST /api/upload),
  // or by the import scripts — never automatically at startup.
  if (config.db.autoSchema) {
    await ensureWarrantySchema(db);
  } else {
    // Opting out of table CREATION must not leave the code running against
    // a table shape it can't use: columns added by later releases are
    // still applied to the existing tables (ALTER only, never CREATE).
    console.log('[schema] DB_AUTO_SCHEMA=false — not creating warranty data tables automatically.');
    try {
      await addMissingColumns(db);
    } catch (err) {
      console.error(`[schema] Could not add columns required by this release: ${err.message}`);
    }
  }
  await ensureAuditSchema(db); // audit_log: tiny, app-owned, always created (like users/sessions)
  await ensureVinSchema(db);   // vin_map: admin-entered VIN body code -> vehicle line rows, same treatment

  // Verify, and say exactly what to do if the upgrade didn't happen (e.g.
  // the login lacks ALTER rights) — otherwise the first upload would fail
  // with a bare "Invalid column name" in the UI.
  const missing = await findMissingColumns(db);
  if (missing.length) {
    console.error(
      `[schema] MISSING COLUMNS: ${missing.map((m) => `${m.table}.${m.column}`).join(', ')}. ` +
      `Imports and change tracking will fail until they exist. Run sql/upgrade-schema.sql against the database, or:\n` +
      upgradeSqlFor(missing)
    );
  }

  await seedSuperAdminFromEnv(db); // no-op unless SUPER_ADMIN_EMAIL/PASSWORD are set in .env
  const app = createApp(db);
  app.listen(config.server.port, () => {
    console.log(`Warranty labor-time app (${config.db.driver}): http://localhost:${config.server.port}`);
  });
})().catch((e) => { console.error(e); process.exit(1); });

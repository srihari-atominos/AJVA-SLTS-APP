/**
 * createSuperAdmin.js
 * One-time ops script to create (or reset) a Super Admin account. Works
 * against whichever driver config.db.driver resolves to (SQLite by
 * default, or MSSQL if DB_HOST/DB_DRIVER=mssql is set) — same connection
 * logic the live server uses (src/config/db.js).
 *
 * Deliberately not reachable through the HTTP API — the only way to
 * create or reassign a Super Admin is to run this on the server itself.
 *
 * Usage:
 *   node src/scripts/createSuperAdmin.js --email=admin@company.com --name="Jane Doe" --password=ChangeMe123!
 *
 * By default (SUPER_ADMIN_ALLOW_MULTIPLE unset/false) there is exactly one
 * Super Admin: if one already exists, this updates that same account
 * (also how you reset a forgotten password) instead of creating a second
 * one. With SUPER_ADMIN_ALLOW_MULTIPLE=true, each distinct --email gets its
 * own Super Admin account — see README for the tradeoff.
 *
 * Equivalent env-based alternative: set SUPER_ADMIN_EMAIL/NAME/PASSWORD in
 * .env and this same logic runs automatically once at server startup
 * (features/users/superAdmin.js's seedSuperAdminFromEnv) — no need to run
 * this script by hand for the very first account.
 */
const config = require('../config');
const { createDb } = require('../config/db');
const { isStrongEnough } = require('../features/users/password');
const { upsertSuperAdmin } = require('../features/users/superAdmin');

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const { email, name, password } = parseArgs();
  if (!email || !password) {
    console.error('Usage: node src/scripts/createSuperAdmin.js --email=you@company.com --name="Your Name" --password=yourpassword');
    process.exit(1);
  }
  if (!isStrongEnough(password)) {
    console.error(`Password must be at least ${config.auth.passwordMinLength} characters.`);
    process.exit(1);
  }

  const db = await createDb();
  const result = await upsertSuperAdmin(db, { email, name, password });
  console.log(`${result.mode === 'created' ? 'Created' : 'Updated'} Super Admin (id ${result.id}) -> ${result.email} [${config.db.driver}]`);

  if (db.raw && db.raw.close) await db.raw.close();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

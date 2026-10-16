/**
 * superAdmin.js
 * Shared logic for creating/updating a Super Admin, used by both the CLI
 * script (src/scripts/createSuperAdmin.js — explicit, deliberate) and the
 * optional env-based auto-seed at server startup (seedSuperAdminFromEnv —
 * implicit, runs on every boot, so it only ever acts when it's
 * unambiguously safe to). Works against either driver via the dbContext.
 */
const { hash } = require('./password');
const config = require('../../config');

/**
 * Create or update a Super Admin account.
 *
 * config.superAdmin.allowMultiple = false (default): there is exactly one
 *   Super Admin. If one already exists (regardless of email), THIS call
 *   updates that same account — that's how you rotate its email/password.
 * config.superAdmin.allowMultiple = true: each distinct email is its own
 *   Super Admin account. An existing one with this email is updated; a new
 *   email creates another Super Admin alongside the rest.
 */
async function upsertSuperAdmin(db, { email, name, password }) {
  const emailNorm = String(email).trim().toLowerCase();
  const passwordHash = await hash(password);
  const allowMultiple = config.superAdmin.allowMultiple;

  const existing = allowMultiple
    ? await db.get(`SELECT * FROM users WHERE role = 'SUPER_ADMIN' AND email = ?`, [emailNorm])
    : await db.get(`SELECT * FROM users WHERE role = 'SUPER_ADMIN'`, []);

  if (existing) {
    await db.run(
      `UPDATE users SET email = ?, name = ?, passwordHash = ?, status = 'active' WHERE id = ?`,
      [emailNorm, name || existing.name, passwordHash, existing.id]
    );
    return { mode: 'updated', id: existing.id, email: emailNorm };
  }

  const { id } = await db.insert(
    `INSERT INTO users (email, name, role, passwordHash, status, createdAt) VALUES (?, ?, 'SUPER_ADMIN', ?, 'active', ?)`,
    [emailNorm, name || null, passwordHash, new Date().toISOString()]
  );
  return { mode: 'created', id, email: emailNorm };
}

/**
 * Called once at server startup. A no-op unless SUPER_ADMIN_EMAIL and
 * SUPER_ADMIN_PASSWORD are both set in .env. In single-admin mode (the
 * default) it will NOT silently overwrite an already-existing Super Admin
 * that has a *different* email than what .env now says — that would mean a
 * stale .env quietly resetting someone's real account on every restart.
 * For a deliberate reset, use `npm run create-super-admin` instead.
 */
async function seedSuperAdminFromEnv(db) {
  const { email, name, password, allowMultiple } = config.superAdmin;
  if (!email || !password) return null; // nothing configured in .env — fine, CLI script still works

  if (!allowMultiple) {
    const existing = await db.get(`SELECT * FROM users WHERE role = 'SUPER_ADMIN'`, []);
    if (existing && existing.email !== email.trim().toLowerCase()) {
      console.log(
        `[super-admin] .env has SUPER_ADMIN_EMAIL=${email}, but a different Super Admin ` +
        `(${existing.email}) already exists and SUPER_ADMIN_ALLOW_MULTIPLE is not set. ` +
        `Not touching it automatically — use "npm run create-super-admin" if you mean to change it.`
      );
      return null;
    }
  }

  const result = await upsertSuperAdmin(db, { email, name, password });
  console.log(`[super-admin] ${result.mode === 'created' ? 'Seeded' : 'Confirmed'} from .env -> ${result.email}`);
  return result;
}

module.exports = { upsertSuperAdmin, seedSuperAdminFromEnv };

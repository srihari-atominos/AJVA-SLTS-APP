/**
 * schema.js
 * Creates the users/sessions tables in warranty.db if they don't already
 * exist. Safe to call on every server start.
 *
 * inviteToken/inviteExpires/invitedBy and the 'invited' status are left in
 * place for compatibility with any already-created database, but nothing
 * writes to them anymore — accounts are created active via self-signup
 * (POST /auth/signup), not an email invite.
 */
function ensureUsersSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY,
      email           TEXT NOT NULL UNIQUE,
      name            TEXT,
      role            TEXT NOT NULL CHECK(role IN ('SUPER_ADMIN','ADMIN','USER')),
      passwordHash    TEXT,
      windowsUsername TEXT UNIQUE,        -- 'domain\\username', lowercased
      status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('invited','active','disabled')),
      inviteToken     TEXT,               -- legacy, unused
      inviteExpires   TEXT,               -- legacy, unused
      invitedBy       INTEGER REFERENCES users(id), -- legacy, unused
      createdAt       TEXT NOT NULL,
      lastLoginAt     TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid     TEXT PRIMARY KEY,
      data    TEXT NOT NULL,
      expires INTEGER NOT NULL
    );
  `);
}

module.exports = { ensureUsersSchema };

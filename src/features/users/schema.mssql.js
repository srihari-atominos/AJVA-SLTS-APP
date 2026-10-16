/**
 * schema.mssql.js
 * T-SQL equivalent of schema.js (users/sessions tables), for the MSSQL
 * driver. Kept as a separate file rather than branching inside schema.js
 * because DDL syntax genuinely differs enough (IDENTITY, NVARCHAR, CHECK
 * constraint placement) that one shared file would be harder to read than
 * two small ones — unlike the repositories, where the dbContext adapter
 * lets the actual query text stay identical between drivers.
 */
async function ensureUsersSchemaMssql(db) {
  await db.run(`
    IF OBJECT_ID('users', 'U') IS NULL
    CREATE TABLE users (
      id              INT IDENTITY(1,1) PRIMARY KEY,
      email           NVARCHAR(255) NOT NULL UNIQUE,
      name            NVARCHAR(255) NULL,
      role            NVARCHAR(20) NOT NULL CHECK(role IN ('SUPER_ADMIN','ADMIN','USER')),
      passwordHash    NVARCHAR(255) NULL,
      windowsUsername NVARCHAR(255) NULL,
      status          NVARCHAR(20) NOT NULL CONSTRAINT DF_users_status DEFAULT 'active'
                        CHECK(status IN ('invited','active','disabled')),
      inviteToken     NVARCHAR(255) NULL,   -- legacy, unused
      inviteExpires   NVARCHAR(50) NULL,    -- legacy, unused
      invitedBy       INT NULL REFERENCES users(id), -- legacy, unused
      createdAt       NVARCHAR(50) NOT NULL,
      lastLoginAt     NVARCHAR(50) NULL
    );
  `, []);

  // A plain UNIQUE constraint in SQL Server only allows ONE NULL per
  // column (unlike SQLite/Postgres, where NULL never counts as a
  // duplicate) — and every user starts with windowsUsername = NULL until
  // they link one. A filtered unique index enforces uniqueness only among
  // the actually-set values, which is what "unique but usually empty"
  // needs. Caught by testing a second signup against a real MSSQL
  // instance — the plain-UNIQUE version passed schema creation silently
  // but broke on the very next INSERT.
  await db.run(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_users_windowsUsername')
    CREATE UNIQUE INDEX UQ_users_windowsUsername ON users(windowsUsername) WHERE windowsUsername IS NOT NULL;
  `, []);

  await db.run(`
    IF OBJECT_ID('sessions', 'U') IS NULL
    CREATE TABLE sessions (
      sid     NVARCHAR(255) PRIMARY KEY,
      data    NVARCHAR(MAX) NOT NULL,
      expires BIGINT NOT NULL
    );
  `, []);
}

module.exports = { ensureUsersSchemaMssql };

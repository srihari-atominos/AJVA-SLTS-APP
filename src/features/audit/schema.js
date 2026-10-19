/**
 * audit/schema.js
 * Creates the audit_log table if missing, for either driver. Called at
 * every server start (server.js), same pattern as users/schema*.js and
 * vehicles/dataSchema.js. Never dropped by the import scripts — the audit
 * trail outlives any data rebuild.
 *
 * One row per data-changing event:
 *   action  'import' | 'edit' | 'delete'
 *   mode    import: 'added' | 'updated' | 'failed'; edit: 'edited'; delete: 'deleted'
 *   rowsAdded / rowsRemoved  labor-time rows written / discarded by the event
 *   details  free text (error message, "totTime 0.5 -> 0.7", ...)
 */
async function ensureAuditSchema(db) {
  if (db.driver === 'mssql') {
    await db.run(`
      IF OBJECT_ID('audit_log', 'U') IS NULL
      CREATE TABLE audit_log (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        at          NVARCHAR(40) NOT NULL,
        userId      INT NULL,
        userEmail   NVARCHAR(255) NULL,
        action      NVARCHAR(20) NOT NULL,
        mode        NVARCHAR(20) NULL,
        fileName    NVARCHAR(255) NULL,
        vehKey      NVARCHAR(100) NULL,
        vehDesc     NVARCHAR(255) NULL,
        rowsAdded   INT NOT NULL CONSTRAINT DF_audit_rowsAdded DEFAULT 0,
        rowsRemoved INT NOT NULL CONSTRAINT DF_audit_rowsRemoved DEFAULT 0,
        details     NVARCHAR(MAX) NULL
      );
    `, []);
    await db.run(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_audit_at')
      CREATE INDEX idx_audit_at ON audit_log(at);
    `, []);
    return;
  }

  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY,
      at          TEXT NOT NULL,
      userId      INTEGER,
      userEmail   TEXT,
      action      TEXT NOT NULL,
      mode        TEXT,
      fileName    TEXT,
      vehKey      TEXT,
      vehDesc     TEXT,
      rowsAdded   INTEGER NOT NULL DEFAULT 0,
      rowsRemoved INTEGER NOT NULL DEFAULT 0,
      details     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
  `);
}

module.exports = { ensureAuditSchema };

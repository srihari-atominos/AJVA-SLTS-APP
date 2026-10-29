/**
 * vin/schema.js
 * Creates the vin_map table if missing, for either driver. Called at every
 * server start (server.js), like audit/schema.js. Never touched by the
 * import scripts — the admin-entered mappings outlive any data rebuild.
 *
 * One row = "VIN positions 5-7 (bodyCode), optionally only for this WMI
 * and this market, mean vehicle line vehCode". The codes the extracts
 * publish themselves live in vehicle_vin_codes (vehicles/dataSchema.js)
 * and are replaced on every upload; this table is the manual complement
 * for lines the extracts say nothing about (China-built, EU, ...).
 */
async function ensureVinSchema(db) {
  if (db.driver === 'mssql') {
    await db.run(`
      IF OBJECT_ID('vin_map', 'U') IS NULL
      CREATE TABLE vin_map (
        id        INT IDENTITY(1,1) PRIMARY KEY,
        wmi       NVARCHAR(3) NULL,
        bodyCode  NVARCHAR(3) NOT NULL,
        gsa       NVARCHAR(20) NULL,
        vehCode   NVARCHAR(20) NOT NULL,
        note      NVARCHAR(255) NULL,
        createdBy NVARCHAR(255) NULL,
        createdAt NVARCHAR(40) NOT NULL
      );
    `, []);
    await db.run(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_vinmap_body')
      CREATE INDEX idx_vinmap_body ON vin_map(bodyCode);
    `, []);
    return;
  }
  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS vin_map (
      id        INTEGER PRIMARY KEY,
      wmi       TEXT,
      bodyCode  TEXT NOT NULL,
      gsa       TEXT,
      vehCode   TEXT NOT NULL,
      note      TEXT,
      createdBy TEXT,
      createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vinmap_body ON vin_map(bodyCode);
  `);
}

module.exports = { ensureVinSchema };

/**
 * dataSchema.js
 * Idempotent "create if missing" DDL for the warranty data tables
 * (vehicles -> engines/transmissions/features, laborops), for both drivers.
 * Called at every server start (see server.js) so a fresh database — e.g.
 * a brand-new MSSQL database the container was just pointed at — gets its
 * tables without anyone having to run an import script first.
 *
 * This NEVER drops or alters an existing table: every statement is guarded
 * by IF NOT EXISTS / IF OBJECT_ID(...) IS NULL, so running it against a
 * database that already has data is a no-op. The scripts under src/scripts/
 * (import-sqlite.js / import-mssql.js) remain the deliberate, destructive
 * "rebuild from scratch" path; this is the safe, automatic one.
 *
 * The column definitions here mirror those scripts exactly — keep them in
 * sync if a column is ever added. Columns added AFTER a table first shipped
 * also go in ADDED_COLUMNS below, so an existing database is upgraded in
 * place (ALTER TABLE ... ADD, only if the column is missing) at startup.
 */

// Columns added after the initial schema: [table, column, sqliteType, mssqlType].
// prodStart/prodEnd: production window ("YYYY-MM") parsed from the vehicle
// description of regional extracts whose header has no model year — see
// vehicleMeta.js.
// changeType/prevTotTime/changedAt: per-entry "what happened in the last
// update" marker set by uploads and manual edits — see laborops/changes.js.
const ADDED_COLUMNS = [
  ['vehicles', 'prodStart', 'TEXT', 'NVARCHAR(10) NULL'],
  ['vehicles', 'prodEnd', 'TEXT', 'NVARCHAR(10) NULL'],
  ['laborops', 'changeType', 'TEXT', 'NVARCHAR(10) NULL'],
  ['laborops', 'prevTotTime', 'REAL', 'FLOAT NULL'],
  ['laborops', 'changedAt', 'TEXT', 'NVARCHAR(40) NULL'],
];

const SQLITE_DDL = `
  CREATE TABLE IF NOT EXISTS vehicles (
    id            INTEGER PRIMARY KEY,
    vehKey        TEXT NOT NULL,
    fileName      TEXT,
    folder        TEXT,
    source        TEXT,
    gsa           TEXT,
    language      TEXT,
    modYear       TEXT,
    prodType      TEXT,
    extractId     TEXT,
    extractDate   TEXT,
    vehCode       TEXT,
    vehDesc       TEXT,
    abbr          TEXT,
    brandCode     TEXT,
    laborOpCount  INTEGER,
    timeEntryCount INTEGER,
    prodStart     TEXT,
    prodEnd       TEXT
  );
  CREATE TABLE IF NOT EXISTS engines (
    vehicleId INTEGER NOT NULL REFERENCES vehicles(id),
    engCode TEXT, desc TEXT, abbr TEXT, numCyl TEXT
  );
  CREATE TABLE IF NOT EXISTS transmissions (
    vehicleId INTEGER NOT NULL REFERENCES vehicles(id),
    code TEXT, desc TEXT, typeInd TEXT
  );
  CREATE TABLE IF NOT EXISTS features (
    vehicleId INTEGER NOT NULL REFERENCES vehicles(id),
    family TEXT, feature TEXT, desc TEXT
  );
  CREATE TABLE IF NOT EXISTS laborops (
    id              INTEGER PRIMARY KEY,
    vehKey          TEXT NOT NULL,
    source          TEXT,
    gsa             TEXT,
    modYear         TEXT,
    vehDesc         TEXT,
    brandCode       TEXT,
    laborDescCode   TEXT,
    baseLaborOp     TEXT,
    combo           TEXT,
    complexCode     TEXT,
    operationDesc   TEXT,
    operType        TEXT,
    secNo           TEXT,
    secDesc         TEXT,
    tsid            TEXT,
    effectiveDate   TEXT,
    status          TEXT,
    fullLaborOpCode TEXT,
    totTime         REAL,
    categoryCode    TEXT,
    catDesc         TEXT,
    qualDesc        TEXT,
    assessedTime    TEXT,
    changeType      TEXT,
    prevTotTime     REAL,
    changedAt       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_veh_key        ON vehicles(vehKey);
  CREATE INDEX IF NOT EXISTS idx_ops_vehkey     ON laborops(vehKey);
  CREATE INDEX IF NOT EXISTS idx_ops_labordesc  ON laborops(laborDescCode);
  CREATE INDEX IF NOT EXISTS idx_ops_fullcode   ON laborops(fullLaborOpCode);
  CREATE INDEX IF NOT EXISTS idx_ops_sort       ON laborops(laborDescCode, fullLaborOpCode);
`;

// One statement per entry: MSSQL needs each CREATE guarded by its own IF,
// and keeping them separate makes a failure message point at one table.
const MSSQL_DDL = [
  `IF OBJECT_ID('vehicles', 'U') IS NULL
   CREATE TABLE vehicles (
     id            INT IDENTITY(1,1) PRIMARY KEY,
     vehKey        NVARCHAR(100) NOT NULL,
     fileName      NVARCHAR(255),
     folder        NVARCHAR(255),
     source        NVARCHAR(20),
     gsa           NVARCHAR(20),
     language      NVARCHAR(20),
     modYear       NVARCHAR(10),
     prodType      NVARCHAR(20),
     extractId     NVARCHAR(50),
     extractDate   NVARCHAR(50),
     vehCode       NVARCHAR(20),
     vehDesc       NVARCHAR(255),
     abbr          NVARCHAR(100),
     brandCode     NVARCHAR(20),
     laborOpCount  INT,
     timeEntryCount INT,
     prodStart     NVARCHAR(10) NULL,
     prodEnd       NVARCHAR(10) NULL
   );`,
  `IF OBJECT_ID('engines', 'U') IS NULL
   CREATE TABLE engines (
     vehicleId INT NOT NULL REFERENCES vehicles(id),
     engCode NVARCHAR(20), [desc] NVARCHAR(255), abbr NVARCHAR(100), numCyl NVARCHAR(10)
   );`,
  `IF OBJECT_ID('transmissions', 'U') IS NULL
   CREATE TABLE transmissions (
     vehicleId INT NOT NULL REFERENCES vehicles(id),
     code NVARCHAR(20), [desc] NVARCHAR(255), typeInd NVARCHAR(10)
   );`,
  `IF OBJECT_ID('features', 'U') IS NULL
   CREATE TABLE features (
     vehicleId INT NOT NULL REFERENCES vehicles(id),
     family NVARCHAR(20), feature NVARCHAR(20), [desc] NVARCHAR(255)
   );`,
  `IF OBJECT_ID('laborops', 'U') IS NULL
   CREATE TABLE laborops (
     id              INT IDENTITY(1,1) PRIMARY KEY,
     vehKey          NVARCHAR(100) NOT NULL,
     source          NVARCHAR(20),
     gsa             NVARCHAR(20),
     modYear         NVARCHAR(10),
     vehDesc         NVARCHAR(255),
     brandCode       NVARCHAR(20),
     laborDescCode   NVARCHAR(20),
     baseLaborOp     NVARCHAR(20),
     combo           NVARCHAR(10),
     complexCode     NVARCHAR(10),
     operationDesc   NVARCHAR(255),
     operType        NVARCHAR(10),
     secNo           NVARCHAR(10),
     secDesc         NVARCHAR(255),
     tsid            NVARCHAR(50),
     effectiveDate   NVARCHAR(50),
     status          NVARCHAR(10),
     fullLaborOpCode NVARCHAR(20),
     totTime         FLOAT,
     categoryCode    NVARCHAR(20),
     catDesc         NVARCHAR(255),
     qualDesc        NVARCHAR(255),
     assessedTime    NVARCHAR(20),
     changeType      NVARCHAR(10) NULL,
     prevTotTime     FLOAT NULL,
     changedAt       NVARCHAR(40) NULL
   );`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_veh_key')
   CREATE INDEX idx_veh_key ON vehicles(vehKey);`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_ops_vehkey')
   CREATE INDEX idx_ops_vehkey ON laborops(vehKey);`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_ops_labordesc')
   CREATE INDEX idx_ops_labordesc ON laborops(laborDescCode);`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_ops_fullcode')
   CREATE INDEX idx_ops_fullcode ON laborops(fullLaborOpCode);`,
  `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_ops_sort')
   CREATE INDEX idx_ops_sort ON laborops(laborDescCode, fullLaborOpCode);`,
];

/**
 * Add any column from `columns` ([table, column, sqliteType, mssqlType])
 * that an older database is missing. Exported so other features' schema
 * modules (audit) can upgrade their own tables the same way.
 */
async function addMissingColumns(db, columns = ADDED_COLUMNS) {
  for (const [table, column, sqliteType, mssqlType] of columns) {
    if (db.driver === 'mssql') {
      await db.run(`IF COL_LENGTH('${table}', '${column}') IS NULL ALTER TABLE ${table} ADD ${column} ${mssqlType};`, []);
    } else {
      const existing = db.raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
      if (!existing.includes(column)) db.raw.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqliteType};`);
    }
  }
}

/** Create any missing warranty data tables/indexes/columns. Safe to call on every start. */
async function ensureWarrantySchema(db) {
  if (db.driver === 'mssql') {
    for (const stmt of MSSQL_DDL) await db.run(stmt, []);
  } else {
    db.raw.exec(SQLITE_DDL); // sqlite DDL is synchronous on the raw handle, same as users/schema.js
  }
  await addMissingColumns(db);
}

module.exports = { ensureWarrantySchema, addMissingColumns };

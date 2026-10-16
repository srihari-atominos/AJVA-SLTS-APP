/**
 * import-mssql.js
 * Loads the NDJSON tables produced by convert.js into MSSQL (the
 * production driver — see README's "Production: MSSQL Server" section).
 * T-SQL equivalent of import-sqlite.js: same source data, same resulting
 * rows, different DDL (IDENTITY instead of INTEGER PRIMARY KEY, NVARCHAR
 * instead of TEXT) and a driver-appropriate insert path.
 *
 * Requires DB_HOST (or DB_DRIVER=mssql) in .env, pointing at a server
 * where the target database (DB_NAME, default "warranty") already exists —
 * this script creates the TABLES, not the database itself.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const config = require('../config');
const { createDb } = require('../config/db');

const DATA_DIR = config.dataDir;

async function readNdjson(file, onRow) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, 'utf8'),
    crlfDelay: Infinity,
  });
  // onRow is async (each call awaits a real network insert) — await it
  // here too, or the for-await loop races ahead of the inserts: readNdjson
  // would resolve as soon as the lines are read, not when the rows the
  // caller fired off have actually finished writing.
  for await (const line of rl) {
    if (line.trim()) await onRow(JSON.parse(line));
  }
}

async function ensureSchema(db) {
  await db.run(`
    IF OBJECT_ID('vehicles', 'U') IS NOT NULL DROP TABLE laborops;
    IF OBJECT_ID('features', 'U') IS NOT NULL DROP TABLE features;
    IF OBJECT_ID('transmissions', 'U') IS NOT NULL DROP TABLE transmissions;
    IF OBJECT_ID('engines', 'U') IS NOT NULL DROP TABLE engines;
    IF OBJECT_ID('vehicles', 'U') IS NOT NULL DROP TABLE vehicles;
  `, []).catch(() => {}); // fresh build each run, same as import-sqlite.js

  await db.run(`
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
      timeEntryCount INT
    );
  `, []);

  await db.run(`
    CREATE TABLE engines (
      vehicleId INT NOT NULL REFERENCES vehicles(id),
      engCode NVARCHAR(20), [desc] NVARCHAR(255), abbr NVARCHAR(100), numCyl NVARCHAR(10)
    );
  `, []);

  await db.run(`
    CREATE TABLE transmissions (
      vehicleId INT NOT NULL REFERENCES vehicles(id),
      code NVARCHAR(20), [desc] NVARCHAR(255), typeInd NVARCHAR(10)
    );
  `, []);

  await db.run(`
    CREATE TABLE features (
      vehicleId INT NOT NULL REFERENCES vehicles(id),
      family NVARCHAR(20), feature NVARCHAR(20), [desc] NVARCHAR(255)
    );
  `, []);

  await db.run(`
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
      assessedTime    NVARCHAR(20)
    );
  `, []);

  await db.run(`CREATE INDEX idx_veh_key ON vehicles(vehKey);`, []);
  await db.run(`CREATE INDEX idx_ops_vehkey ON laborops(vehKey);`, []);
  await db.run(`CREATE INDEX idx_ops_labordesc ON laborops(laborDescCode);`, []);
  await db.run(`CREATE INDEX idx_ops_fullcode ON laborops(fullLaborOpCode);`, []);
  await db.run(`CREATE INDEX idx_ops_sort ON laborops(laborDescCode, fullLaborOpCode);`, []);
}

async function main() {
  const t0 = Date.now();
  if (config.db.driver !== 'mssql') {
    console.error('config.db.driver is not "mssql" — set DB_HOST (or DB_DRIVER=mssql) in .env first.');
    process.exit(1);
  }

  const db = await createDb();
  console.log('Rebuilding schema...');
  await ensureSchema(db);

  const insertVehicleSql = `INSERT INTO vehicles
    (vehKey, fileName, folder, source, gsa, language, modYear, prodType, extractId, extractDate,
     vehCode, vehDesc, abbr, brandCode, laborOpCount, timeEntryCount)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const insertLaborOpSql = `INSERT INTO laborops
    (vehKey, source, gsa, modYear, vehDesc, brandCode, laborDescCode, baseLaborOp, combo,
     complexCode, operationDesc, operType, secNo, secDesc, tsid, effectiveDate, status,
     fullLaborOpCode, totTime, categoryCode, catDesc, qualDesc, assessedTime)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

  // Wrapped in one transaction per table — same shape as import-sqlite.js's
  // BEGIN/COMMIT, and over a real network connection it also matters for
  // speed: committing once at the end avoids a log flush per row.
  let vehCount = 0;
  await db.transaction(async (tx) => {
    await readNdjson(path.join(DATA_DIR, 'vehicles.ndjson'), async (v) => {
      const { id } = await tx.insert(insertVehicleSql, [
        v.vehKey, v.fileName, v.folder, v.source, v.gsa, v.language, v.modYear, v.prodType,
        String(v.extractId ?? ''), v.extractDate, v.vehCode, v.vehDesc, v.abbr, v.brandCode,
        v.laborOpCount, v.timeEntryCount,
      ]);
      for (const e of v.engines || []) {
        await tx.run('INSERT INTO engines VALUES (?,?,?,?,?)', [id, e.engCode ?? null, e.desc ?? null, e.abbr ?? null, e.numCyl ?? null]);
      }
      for (const t of v.transmissions || []) {
        await tx.run('INSERT INTO transmissions VALUES (?,?,?,?)', [id, t.code ?? null, t.desc ?? null, t.typeInd ?? null]);
      }
      for (const f of v.features || []) {
        await tx.run('INSERT INTO features VALUES (?,?,?,?)', [id, f.family ?? null, f.feature ?? null, f.desc ?? null]);
      }
      vehCount++;
      if (vehCount % 10 === 0) console.log(`  vehicles: ${vehCount}...`);
    });
  });
  console.log(`vehicles: ${vehCount} rows (+ engines/transmissions/features)`);

  let opCount = 0;
  await db.transaction(async (tx) => {
    await readNdjson(path.join(DATA_DIR, 'laborops.ndjson'), async (o) => {
      await tx.run(insertLaborOpSql, [
        o.vehKey, o.source, o.gsa, o.modYear, o.vehDesc, o.brandCode,
        o.laborDescCode ?? null, o.baseLaborOp ?? null, o.combo ?? null,
        o.complexCode ?? null, o.operationDesc ?? null, o.operType ?? null,
        o.secNo ?? null, o.secDesc ?? null, String(o.tsid ?? ''), o.effectiveDate ?? null,
        o.status ?? null, o.fullLaborOpCode ?? null, o.totTime, o.categoryCode ?? null,
        o.catDesc, o.qualDesc, o.assessedTime ?? null,
      ]);
      opCount++;
      if (opCount % 5000 === 0) console.log(`  laborops: ${opCount}...`);
    });
  });
  console.log(`laborops: ${opCount} rows`);

  if (db.raw && db.raw.close) await db.raw.close();
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => { console.error(e); process.exit(1); });

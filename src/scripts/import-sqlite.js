/**
 * import-sqlite.js
 * Loads the NDJSON tables produced by convert.js into a local SQLite database
 * (data/warranty.db) using Node's built-in sqlite driver — no server needed.
 * Relational schema: vehicles -> engines/transmissions/features, laborops.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

const DATA_DIR = config.dataDir;
const DB_PATH = path.join(DATA_DIR, 'warranty.db');

async function readNdjson(file, onRow) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file, 'utf8'),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) onRow(JSON.parse(line));
  }
}

async function main() {
  const t0 = Date.now();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); // fresh build each run

  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE vehicles (
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

    CREATE TABLE engines (
      vehicleId INTEGER NOT NULL REFERENCES vehicles(id),
      engCode TEXT, desc TEXT, abbr TEXT, numCyl TEXT
    );

    CREATE TABLE transmissions (
      vehicleId INTEGER NOT NULL REFERENCES vehicles(id),
      code TEXT, desc TEXT, typeInd TEXT
    );

    CREATE TABLE features (
      vehicleId INTEGER NOT NULL REFERENCES vehicles(id),
      family TEXT, feature TEXT, desc TEXT
    );

    CREATE TABLE laborops (
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
  `);

  const insVeh = db.prepare(`INSERT INTO vehicles
    (vehKey, fileName, folder, source, gsa, language, modYear, prodType, extractId, extractDate,
     vehCode, vehDesc, abbr, brandCode, laborOpCount, timeEntryCount, prodStart, prodEnd)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insEng = db.prepare(`INSERT INTO engines VALUES (?,?,?,?,?)`);
  const insTrans = db.prepare(`INSERT INTO transmissions VALUES (?,?,?,?)`);
  const insFeat = db.prepare(`INSERT INTO features VALUES (?,?,?,?)`);
  const insOp = db.prepare(`INSERT INTO laborops
    (vehKey, source, gsa, modYear, vehDesc, brandCode, laborDescCode, baseLaborOp, combo,
     complexCode, operationDesc, operType, secNo, secDesc, tsid, effectiveDate, status,
     fullLaborOpCode, totTime, categoryCode, catDesc, qualDesc, assessedTime)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  // Vehicles + child tables
  db.exec('BEGIN');
  let vehCount = 0;
  await readNdjson(path.join(DATA_DIR, 'vehicles.ndjson'), (v) => {
    const r = insVeh.run(
      v.vehKey, v.fileName, v.folder, v.source, v.gsa, v.language, v.modYear, v.prodType,
      String(v.extractId ?? ''), v.extractDate, v.vehCode, v.vehDesc, v.abbr, v.brandCode,
      v.laborOpCount, v.timeEntryCount, v.prodStart ?? null, v.prodEnd ?? null
    );
    const id = Number(r.lastInsertRowid);
    for (const e of v.engines || []) insEng.run(id, e.engCode ?? null, e.desc ?? null, e.abbr ?? null, e.numCyl ?? null);
    for (const t of v.transmissions || []) insTrans.run(id, t.code ?? null, t.desc ?? null, t.typeInd ?? null);
    for (const f of v.features || []) insFeat.run(id, f.family ?? null, f.feature ?? null, f.desc ?? null);
    vehCount++;
  });
  db.exec('COMMIT');
  console.log(`vehicles: ${vehCount} rows (+ engines/transmissions/features)`);

  // Labor ops
  db.exec('BEGIN');
  let opCount = 0;
  await readNdjson(path.join(DATA_DIR, 'laborops.ndjson'), (o) => {
    insOp.run(
      o.vehKey, o.source, o.gsa, o.modYear, o.vehDesc, o.brandCode,
      o.laborDescCode ?? null, o.baseLaborOp ?? null, o.combo ?? null,
      o.complexCode ?? null, o.operationDesc ?? null, o.operType ?? null,
      o.secNo ?? null, o.secDesc ?? null, String(o.tsid ?? ''), o.effectiveDate ?? null,
      o.status ?? null, o.fullLaborOpCode ?? null, o.totTime, o.categoryCode ?? null,
      o.catDesc, o.qualDesc, o.assessedTime ?? null
    );
    opCount++;
    if (opCount % 50000 === 0) console.log(`  laborops: ${opCount} rows...`);
  });
  db.exec('COMMIT');
  console.log(`laborops: ${opCount} rows`);

  console.log('Creating indexes...');
  db.exec(`
    CREATE INDEX idx_veh_key        ON vehicles(vehKey);
    CREATE INDEX idx_ops_vehkey     ON laborops(vehKey);
    CREATE INDEX idx_ops_labordesc  ON laborops(laborDescCode);
    CREATE INDEX idx_ops_fullcode   ON laborops(fullLaborOpCode);
    CREATE INDEX idx_ops_sort       ON laborops(laborDescCode, fullLaborOpCode);
    ANALYZE;
  `);
  db.close();

  const size = fs.statSync(DB_PATH).size / 1024 / 1024;
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${DB_PATH} (${size.toFixed(1)} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

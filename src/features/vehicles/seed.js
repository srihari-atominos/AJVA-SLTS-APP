/**
 * seed.js
 * Automatic first-run data load. At server start, if the warranty data
 * tables exist but are EMPTY, loads them from the NDJSON files that
 * convert.js produces — so a freshly created database (typically a new
 * MSSQL database the container was just pointed at) comes up with data,
 * no manual `npm run import:mssql` step needed.
 *
 * Deliberately conservative:
 *   - Only ever runs when BOTH vehicles and laborops are empty. A database
 *     with any rows at all is left exactly as it is — this never truncates,
 *     re-imports, or "tops up".
 *   - Looks for the files in SEED_DIR (default ./seed — the gzipped copies
 *     committed to the repo and baked into the Docker image) and then in
 *     DATA_DIR (where convert.js writes plain .ndjson in local dev). Either
 *     .ndjson or .ndjson.gz is accepted.
 *   - If no seed files are found it logs a warning and skips; the app still
 *     starts (empty tables, upload via the UI still works).
 *
 * Rows go in through dbContext.bulkInsert in chunks inside one transaction
 * per table — on MSSQL that's the driver's native bulk load (seconds for
 * 111k rows), not 111k parameterised INSERTs (which measured at ~300 rows/s
 * even against a local instance, i.e. minutes at every first start).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const config = require('../../config');

// Column specs double as the bulk-load type map — lengths and nullability
// mirror dataSchema.js / import-mssql.js exactly (SQLite ignores them).
// MSSQL's bulk load rejects the whole batch ("Invalid column type from bcp
// client for colid N") if a column's declared nullability differs from the
// table's, so NOT NULL columns must be marked nullable: false here.
const nv = (name, length, nullable = true) => ({ name, type: 'nvarchar', length, nullable });
const VEHICLE_COLS = [
  nv('vehKey', 100, false), nv('fileName', 255), nv('folder', 255), nv('source', 20), nv('gsa', 20), nv('language', 20),
  nv('modYear', 10), nv('prodType', 20), nv('extractId', 50), nv('extractDate', 50), nv('vehCode', 20),
  nv('vehDesc', 255), nv('abbr', 100), nv('brandCode', 20), { name: 'laborOpCount', type: 'int' },
  { name: 'timeEntryCount', type: 'int' },
];
const ENGINE_COLS = [{ name: 'vehicleId', type: 'int', nullable: false }, nv('engCode', 20), nv('desc', 255), nv('abbr', 100), nv('numCyl', 10)];
const TRANSMISSION_COLS = [{ name: 'vehicleId', type: 'int', nullable: false }, nv('code', 20), nv('desc', 255), nv('typeInd', 10)];
const FEATURE_COLS = [{ name: 'vehicleId', type: 'int', nullable: false }, nv('family', 20), nv('feature', 20), nv('desc', 255)];
const LABOROP_COLS = [
  nv('vehKey', 100, false), nv('source', 20), nv('gsa', 20), nv('modYear', 10), nv('vehDesc', 255), nv('brandCode', 20),
  nv('laborDescCode', 20), nv('baseLaborOp', 20), nv('combo', 10), nv('complexCode', 10), nv('operationDesc', 255),
  nv('operType', 10), nv('secNo', 10), nv('secDesc', 255), nv('tsid', 50), nv('effectiveDate', 50), nv('status', 10),
  nv('fullLaborOpCode', 20), { name: 'totTime', type: 'float' }, nv('categoryCode', 20), nv('catDesc', 255),
  nv('qualDesc', 255), nv('assessedTime', 20),
];

// Rows buffered per bulkInsert call. Bounds memory (a chunk of laborops is
// a few MB) while keeping the number of bulk operations small.
const CHUNK_ROWS = 20000;

function findSeedFile(baseName) {
  const candidates = [
    path.join(config.seedDir, `${baseName}.ndjson`),
    path.join(config.seedDir, `${baseName}.ndjson.gz`),
    path.join(config.dataDir, `${baseName}.ndjson`),
    path.join(config.dataDir, `${baseName}.ndjson.gz`),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function readNdjson(file, onRow) {
  let input = fs.createReadStream(file);
  if (file.endsWith('.gz')) input = input.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) await onRow(JSON.parse(line));
  }
}

/** Accumulates rows and hands them to bulkInsert a chunk at a time. */
function makeBatcher(tx, table, columns) {
  let buffer = [];
  let total = 0;

  async function flush() {
    if (!buffer.length) return;
    await tx.bulkInsert(table, columns, buffer);
    total += buffer.length;
    buffer = [];
  }
  async function add(values) {
    buffer.push(values);
    if (buffer.length >= CHUNK_ROWS) await flush();
  }
  return { add, flush, count: () => total };
}

function vehicleValues(v) {
  return [
    v.vehKey, v.fileName, v.folder, v.source, v.gsa, v.language, v.modYear, v.prodType,
    String(v.extractId ?? ''), v.extractDate, v.vehCode, v.vehDesc, v.abbr, v.brandCode,
    v.laborOpCount, v.timeEntryCount,
  ];
}
function laborOpValues(o) {
  return [
    o.vehKey, o.source, o.gsa, o.modYear, o.vehDesc, o.brandCode,
    o.laborDescCode ?? null, o.baseLaborOp ?? null, o.combo ?? null,
    o.complexCode ?? null, o.operationDesc ?? null, o.operType ?? null,
    o.secNo ?? null, o.secDesc ?? null, String(o.tsid ?? ''), o.effectiveDate ?? null,
    o.status ?? null, o.fullLaborOpCode ?? null, o.totTime, o.categoryCode ?? null,
    o.catDesc, o.qualDesc, o.assessedTime ?? null,
  ];
}

async function isEmpty(db, table) {
  const row = await db.get(`SELECT COUNT(*) AS n FROM ${table}`, []);
  return Number(row.n) === 0;
}

/**
 * Seed vehicles/engines/transmissions/features/laborops if (and only if)
 * they are all empty. Returns a summary, or null when nothing was done.
 */
async function seedWarrantyDataIfEmpty(db) {
  if (!(await isEmpty(db, 'vehicles')) || !(await isEmpty(db, 'laborops'))) {
    console.log('[seed] Warranty data tables already contain rows — leaving them untouched.');
    return null;
  }

  const vehFile = findSeedFile('vehicles');
  const opFile = findSeedFile('laborops');
  if (!vehFile || !opFile) {
    console.warn(
      `[seed] Warranty data tables are empty but no seed files were found ` +
      `(looked for vehicles/laborops .ndjson[.gz] in ${config.seedDir} and ${config.dataDir}). ` +
      `Starting with empty tables — run "npm run convert" or upload XML via the UI.`
    );
    return null;
  }

  const t0 = Date.now();
  console.log(`[seed] Tables are empty — loading from ${vehFile} and ${opFile} ...`);

  // Vehicles + child rows. Each vehicle needs its generated id for the child
  // tables, so vehicles go one at a time (there are ~126) and the children
  // are collected and bulk-loaded once at the end. All in one transaction.
  let vehCount = 0;
  await db.transaction(async (tx) => {
    const engines = makeBatcher(tx, 'engines', ENGINE_COLS);
    const transmissions = makeBatcher(tx, 'transmissions', TRANSMISSION_COLS);
    const features = makeBatcher(tx, 'features', FEATURE_COLS);
    const vehNames = VEHICLE_COLS.map((c) => c.name);
    await readNdjson(vehFile, async (v) => {
      const { id } = await tx.insert(
        `INSERT INTO vehicles (${vehNames.join(', ')}) VALUES (${vehNames.map(() => '?').join(',')})`,
        vehicleValues(v)
      );
      for (const e of v.engines || []) await engines.add([id, e.engCode ?? null, e.desc ?? null, e.abbr ?? null, e.numCyl ?? null]);
      for (const t of v.transmissions || []) await transmissions.add([id, t.code ?? null, t.desc ?? null, t.typeInd ?? null]);
      for (const f of v.features || []) await features.add([id, f.family ?? null, f.feature ?? null, f.desc ?? null]);
      vehCount++;
    });
    await engines.flush(); await transmissions.flush(); await features.flush();
  });
  console.log(`[seed] vehicles: ${vehCount} rows (+ engines/transmissions/features)`);

  // Labor ops, bulk-loaded in chunks.
  let opCount = 0;
  await db.transaction(async (tx) => {
    const batch = makeBatcher(tx, 'laborops', LABOROP_COLS);
    await readNdjson(opFile, async (o) => {
      await batch.add(laborOpValues(o));
      if (++opCount % 25000 === 0) console.log(`[seed]   laborops: ${opCount}...`);
    });
    await batch.flush();
    opCount = batch.count();
  });
  console.log(`[seed] laborops: ${opCount} rows`);

  if (db.driver === 'sqlite') db.raw.exec('ANALYZE;');
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[seed] Done in ${secs}s`);
  return { vehicles: vehCount, laborops: opCount, seconds: Number(secs) };
}

module.exports = { seedWarrantyDataIfEmpty };

/**
 * convert.js
 * Walks every *_XML folder next to this app, parses each GSLTS PUBEXTRACT XML
 * (via features/vehicles/flatten.js) and writes two data tables as NDJSON
 * (one JSON row per line):
 *
 *   data/vehicles.ndjson  - one row per XML file (vehicle line + engines/transmissions/features)
 *   data/laborops.ndjson  - one row per FULLLABOROP (the actual labor-time entry)
 *
 * NDJSON is used because it streams: rows are appended one at a time (no giant
 * in-memory array), it can be re-imported in batches, and any single line is
 * independently readable/grep-able.
 */
const fs = require('fs');
const path = require('path');
const { flattenExtract } = require('../features/vehicles/flatten');
const config = require('../config');

const DATA_ROOT = config.xmlSourceDir; // the folder that holds the *_XML folders
const OUT_DIR = config.dataDir;
const APP_DIR = path.join(__dirname, '..', '..'); // the SLTS app folder itself, to skip when walking DATA_ROOT

function writeLine(stream, obj) {
  const ok = stream.write(JSON.stringify(obj) + '\n');
  if (ok) return Promise.resolve();
  return new Promise((res) => stream.once('drain', res));
}

function findXmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full === APP_DIR) continue; // skip the app folder itself
      out.push(...findXmlFiles(full));
    } else if (entry.name.toLowerCase().endsWith('.xml')) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const vehStream = fs.createWriteStream(path.join(OUT_DIR, 'vehicles.ndjson'));
  const opStream = fs.createWriteStream(path.join(OUT_DIR, 'laborops.ndjson'));

  const files = findXmlFiles(DATA_ROOT);
  console.log(`Found ${files.length} XML files under ${DATA_ROOT}`);

  let totalRows = 0;
  const t0 = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const xml = fs.readFileSync(file, 'utf8');
    const result = flattenExtract(xml, {
      fileName: path.basename(file),
      folder: path.basename(path.dirname(file)),
    });
    if (!result) {
      console.warn(`  SKIP (no PUBEXTRACT): ${file}`);
      continue;
    }
    for (const w of result.warnings || []) console.warn(`  WARN ${w}`);

    for (const row of result.laborOps) await writeLine(opStream, row);
    await writeLine(vehStream, result.vehicle);

    totalRows += result.laborOps.length;
    console.log(`[${i + 1}/${files.length}] ${path.basename(file)} -> ${result.laborOps.length} rows`);
  }

  await new Promise((res) => vehStream.end(res));
  await new Promise((res) => opStream.end(res));
  console.log(`\nDone: ${totalRows} labor-time rows from ${files.length} files in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Output: ${OUT_DIR}\\vehicles.ndjson, laborops.ndjson`);
}

main().catch((e) => { console.error(e); process.exit(1); });

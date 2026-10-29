/**
 * backfill-vin-codes.js
 * Fills vehicle_vin_codes (the "VIN positions 5-7 -> vehicle line" rows
 * each GSLTS extract publishes) for vehicles that were loaded BEFORE the
 * VIN search existed. Every upload stores these rows itself; this is only
 * for data that is already in the database.
 *
 * Walks XML_SOURCE_DIR (and any extra folders given on the command line),
 * flattens each extract with the same function uploads use, and for every
 * vehicle that exists in the database replaces its rows. Files for vehicles
 * that are not loaded are skipped. Idempotent.
 *
 *   npm run backfill:vin-codes
 *   npm run backfill:vin-codes -- "D:\path\to\EUEN" "D:\other\folder"
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { createDb } = require('../config/db');
const { ensureWarrantySchema } = require('../features/vehicles/dataSchema');
const { flattenExtract } = require('../features/vehicles/flatten');
const { makeVehiclesRepository } = require('../features/vehicles/vehicles.repository');

const APP_DIR = path.join(__dirname, '..', '..');

function findXmlFiles(dir, out = []) {
  if (!fs.existsSync(dir)) { console.warn(`-- WARN folder not found: ${dir}`); return out; }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (full !== APP_DIR) findXmlFiles(full, out); }
    else if (entry.name.toLowerCase().endsWith('.xml')) out.push(full);
  }
  return out;
}

async function main() {
  const db = await createDb();
  await ensureWarrantySchema(db);

  const loaded = new Map((await db.all('SELECT id, vehKey FROM vehicles', [])).map((v) => [v.vehKey, v.id]));
  const dirs = [config.xmlSourceDir, ...process.argv.slice(2)];
  const files = dirs.flatMap((d) => findXmlFiles(d));
  console.log(`-- ${config.db.driver}: ${loaded.size} vehicles loaded, ${files.length} XML files found under ${dirs.join(', ')}`);

  let updated = 0, skipped = 0, rows = 0, noCodes = 0;
  for (const file of files) {
    const parsed = flattenExtract(fs.readFileSync(file, 'utf8'), { fileName: path.basename(file) });
    if (!parsed) continue;
    const vehicleId = loaded.get(parsed.vehicle.vehKey);
    if (!vehicleId) { skipped++; continue; }
    const codes = parsed.vehicle.vinCodes || [];
    await db.transaction(async (tx) => {
      const repo = makeVehiclesRepository(tx);
      await repo.deleteVinCodes(vehicleId);
      for (const c of codes) await repo.insertVinCode(vehicleId, parsed.vehicle, c);
    });
    updated++; rows += codes.length; if (!codes.length) noCodes++;
    console.log(`  ${parsed.vehicle.vehKey.padEnd(18)} ${String(codes.length).padStart(3)} code(s)  ${path.basename(file)}`);
  }
  console.log(`-- done: ${updated} vehicles updated (${rows} rows, ${noCodes} extracts publish no codes), ${skipped} files for vehicles not loaded.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

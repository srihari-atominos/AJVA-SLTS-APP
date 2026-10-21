/**
 * backfill-vehicle-meta.js
 * One-off repair for vehicles loaded BEFORE vehicleMeta.js existed: rows
 * whose market/model year are the literal "ALL" from a regional (EU)
 * extract header. Re-derives gsa / modYear / prodStart / prodEnd from the
 * stored description with the exact same function every upload now uses,
 * and applies the result to BOTH `vehicles` and its `laborops` rows (the
 * labor-time filters run against laborops.gsa / laborops.modYear).
 *
 * Uses the app's own DB config (.env: DB_HOST etc.), so it works against
 * SQLite or MSSQL. Idempotent — rows that already match are skipped.
 *
 *   npm run backfill:vehicle-meta            # DRY RUN: prints the SQL it would run, changes nothing
 *   npm run backfill:vehicle-meta -- --apply # runs those updates in one transaction
 *
 * The dry-run output is plain T-SQL / SQL with literal values, so it can
 * also be reviewed and executed by hand (e.g. in SSMS) instead of --apply.
 * The vehKey is never changed: it is the upsert key and must stay as the
 * raw header produced it (e.g. "EU-ALL-ALL-03").
 */
const config = require('../config');
const { createDb } = require('../config/db');
const { ensureWarrantySchema } = require('../features/vehicles/dataSchema');
const { deriveVehicleMeta } = require('../features/vehicles/vehicleMeta');

const APPLY = process.argv.includes('--apply');

const lit = (v) => (v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const same = (a, b) => (a ?? null) === (b ?? null);

async function main() {
  const db = await createDb();
  // Makes sure prodStart/prodEnd exist (no-op if they already do).
  await ensureWarrantySchema(db);

  const rows = await db.all(
    'SELECT id, vehKey, source, gsa, modYear, vehDesc, prodStart, prodEnd FROM vehicles ORDER BY vehKey', []
  );

  const changes = [];
  const warnings = [];
  for (const r of rows) {
    // A stored fractional year ("2016.5") came from an earlier version of
    // the derivation that kept Ford's label verbatim; treat it as unknown so
    // it is re-derived to the whole year like every new upload does now.
    const storedYear = /\./.test(String(r.modYear || '')) ? 'ALL' : r.modYear;
    const d = deriveVehicleMeta({ source: r.source, gsa: r.gsa, modYear: storedYear, vehDesc: r.vehDesc });
    for (const w of d.warnings) warnings.push(`${r.vehKey}: ${w}`);
    const vehicleChanged = !same(d.gsa, r.gsa) || !same(d.modYear, r.modYear)
      || !same(d.prodStart, r.prodStart) || !same(d.prodEnd, r.prodEnd);
    if (!vehicleChanged) continue;
    changes.push({
      vehKey: r.vehKey, vehDesc: r.vehDesc, before: r, after: d,
      laborOpsChanged: !same(d.gsa, r.gsa) || !same(d.modYear, r.modYear),
    });
  }

  console.log(`-- ${config.db.driver}: ${rows.length} vehicles scanned, ${changes.length} need updating.`);
  for (const w of warnings) console.log(`-- WARN ${w}`);

  if (changes.length === 0) {
    console.log('-- Nothing to do.');
  } else {
    console.log(APPLY ? '-- Applying:' : '-- DRY RUN (re-run with --apply to execute):');
    for (const c of changes) {
      const { after: a, before: b } = c;
      console.log(`-- ${c.vehDesc}: gsa ${b.gsa} -> ${a.gsa}, modYear ${b.modYear} -> ${a.modYear}, window ${a.prodStart ?? '-'}..${a.prodEnd ?? '-'}`);
      console.log(`UPDATE vehicles SET gsa = ${lit(a.gsa)}, modYear = ${lit(a.modYear)}, prodStart = ${lit(a.prodStart)}, prodEnd = ${lit(a.prodEnd)} WHERE vehKey = ${lit(c.vehKey)};`);
      if (c.laborOpsChanged) {
        console.log(`UPDATE laborops SET gsa = ${lit(a.gsa)}, modYear = ${lit(a.modYear)} WHERE vehKey = ${lit(c.vehKey)};`);
      }
    }
  }

  if (APPLY && changes.length) {
    let vehicles = 0;
    let laborops = 0;
    await db.transaction(async (tx) => {
      for (const c of changes) {
        const a = c.after;
        const r1 = await tx.run(
          'UPDATE vehicles SET gsa = ?, modYear = ?, prodStart = ?, prodEnd = ? WHERE vehKey = ?',
          [a.gsa, a.modYear, a.prodStart, a.prodEnd, c.vehKey]
        );
        vehicles += r1.changes;
        if (c.laborOpsChanged) {
          const r2 = await tx.run('UPDATE laborops SET gsa = ?, modYear = ? WHERE vehKey = ?', [a.gsa, a.modYear, c.vehKey]);
          laborops += r2.changes;
        }
      }
    });
    console.log(`-- Applied: ${vehicles} vehicle rows, ${laborops} laborops rows updated.`);
  }

  if (db.raw && db.raw.close) await db.raw.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

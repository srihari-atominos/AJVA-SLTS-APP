/**
 * export-csv.js
 * Exports tables from data/warranty.db to CSV files in data/csv/.
 * Usage:
 *   node src/scripts/export-csv.js                  -> exports laborops + vehicles (full tables)
 *   node src/scripts/export-csv.js laborops         -> exports only laborops
 *   node src/scripts/export-csv.js laborops "WHERE vehKey = 'IM-CHN-2021-TU'"   -> filtered export
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config');

const DB_PATH = path.join(config.dataDir, 'warranty.db');
const OUT_DIR = path.join(config.dataDir, 'csv');

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function exportTable(db, table, whereSql, outFile) {
  const rows = db.prepare(`SELECT * FROM ${table} ${whereSql || ''}`).all();
  if (rows.length === 0) {
    console.log(`${table}: 0 rows matched, skipping`);
    return 0;
  }
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvEscape(r[c])).join(','));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(outFile, lines.join('\r\n'), 'utf8');
  console.log(`${table}: ${rows.length} rows -> ${outFile}`);
  return rows.length;
}

function main() {
  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  const [tableArg, whereArg] = process.argv.slice(2);

  if (tableArg) {
    exportTable(db, tableArg, whereArg, path.join(OUT_DIR, `${tableArg}.csv`));
  } else {
    exportTable(db, 'laborops', '', path.join(OUT_DIR, 'laborops.csv'));
    exportTable(db, 'vehicles', '', path.join(OUT_DIR, 'vehicles.csv'));
  }
  db.close();
}

main();

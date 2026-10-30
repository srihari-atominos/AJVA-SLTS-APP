/**
 * learn.js
 * Derive VIN mapping rows from claim records — pure, see test/vinLearn.test.js.
 *
 * Any export that lists a VIN next to the vehicle (a claims report, a DMS
 * extract, a Ford warranty portal download) is enough to build the
 * "body code -> vehicle line" table that Ford does not publish for the
 * China-built lines: each VIN gives WMI + body code, the vehicle column
 * gives the line, and the same pair repeated across claims confirms it.
 *
 *   parseClaimRecords(text)              CSV / TSV text -> [{ line, vin, vehicle, gsa }]
 *   deriveMappings(records, vehicles)    -> { rows, conflicts, unresolved, invalid, total }
 */
const { parseVin } = require('./decode');

const VIN_HEADERS = ['vin', 'chassis', 'chassisno', 'chassisnumber', 'vinnumber', 'vehicleidentificationnumber'];
const VEHICLE_HEADERS = ['vehcode', 'vehiclecode', 'linecode', 'model', 'vehicle', 'vehicleline', 'vehdesc', 'vehicledescription', 'line', 'description', 'carline', 'modelname'];
const GSA_HEADERS = ['gsa', 'market', 'country'];

function norm(h) { return String(h || '').toLowerCase().replace(/[^a-z]/g, ''); }

function detectSeparator(line) {
  const counts = { '\t': (line.match(/\t/g) || []).length, ';': (line.match(/;/g) || []).length, ',': (line.match(/,/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function splitLine(line, sep) {
  // Minimal CSV: quoted cells may contain the separator.
  const cells = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Parse claim records. With a header line the VIN and vehicle columns are
 * found by name (any of the usual spellings, in any order; other columns are
 * ignored). Without one the first column is the VIN and the second the
 * vehicle. A VIN-looking value anywhere on the line is also accepted when
 * no header names a VIN column.
 */
function parseClaimRecords(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const sep = detectSeparator(lines[0]);
  const head = splitLine(lines[0], sep).map(norm);
  const vinCol = head.findIndex((h) => VIN_HEADERS.includes(h));
  const hasHeader = vinCol >= 0 || head.some((h) => VEHICLE_HEADERS.includes(h));
  let vehCol = head.findIndex((h) => VEHICLE_HEADERS.includes(h));
  const gsaCol = hasHeader ? head.findIndex((h) => GSA_HEADERS.includes(h)) : -1;
  const out = [];
  for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
    const cells = splitLine(lines[i], sep);
    let vin = vinCol >= 0 ? cells[vinCol] : cells.find((c) => /^[A-HJ-NPR-Z0-9]{17}$/i.test(c)) || cells[0];
    let vehicle;
    if (vehCol >= 0) vehicle = cells[vehCol];
    else {
      const vi = cells.indexOf(vin);
      vehicle = cells.find((c, k) => k !== vi && c);
    }
    out.push({ line: i + 1, vin: String(vin || '').trim(), vehicle: String(vehicle || '').trim(), gsa: gsaCol >= 0 ? String(cells[gsaCol] || '').trim().toUpperCase() || null : null });
  }
  return out;
}

/**
 * Find the vehicle line a free-text vehicle cell refers to.
 * Accepts the 2-character vehicle code (TZ), the vehicle key
 * (IM-CHN-2021-TZ), the full description, or a model name that is the first
 * word(s) of a description ("Explorer" matches "Explorer - TZ - U625").
 * @returns {{ vehCode, gsa|null, vehDesc }|{ ambiguous: string[] }|null}
 */
function resolveVehicle(text, vehicles, gsaHint = null) {
  const t = String(text || '').trim().toUpperCase();
  if (!t) return null;
  const pool = gsaHint ? vehicles.filter((v) => v.gsa === gsaHint) : vehicles;
  const finish = (hits) => {
    const codes = [...new Set(hits.map((v) => v.vehCode))];
    if (codes.length === 1) {
      const gsas = [...new Set(hits.map((v) => v.gsa))];
      return { vehCode: codes[0], gsa: gsas.length === 1 ? gsas[0] : null, vehDesc: hits[0].vehDesc };
    }
    return codes.length ? { ambiguous: codes } : null;
  };
  let hits = pool.filter((v) => v.vehKey.toUpperCase() === t);
  if (hits.length) return finish(hits);
  if (/^[A-Z0-9]{2}$/.test(t)) {
    hits = pool.filter((v) => v.vehCode.toUpperCase() === t);
    if (hits.length) return finish(hits);
  }
  const nameOf = (v) => String(v.vehDesc || '').split(' - ')[0].trim().toUpperCase();
  hits = pool.filter((v) => String(v.vehDesc || '').toUpperCase() === t || nameOf(v) === t);
  if (hits.length) return finish(hits);
  // "Ford Explorer 2024 4WD" contains the model name; take the longest name that fits.
  const names = [...new Set(pool.map(nameOf))].filter(Boolean).sort((a, b) => b.length - a.length);
  const word = (n) => new RegExp(`(^|[^A-Z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`);
  const name = names.find((n) => word(n).test(t));
  if (name) return finish(pool.filter((v) => nameOf(v) === name));
  return null;
}

/**
 * Turn claim records into candidate mapping rows.
 *
 * @param {Array} records   parseClaimRecords() output
 * @param {Array} vehicles  loaded vehicles: { vehKey, gsa, modYear, vehCode, vehDesc }
 * @param {Date}  now       for model-year decoding
 * @returns {{ total, rows, conflicts, unresolved, invalid }}
 *   rows        [{ wmi, bodyCode, gsa, vehCode, vehDesc, count, modelYears, exampleVin }] — one vehicle per WMI+body code
 *   conflicts   [{ wmi, bodyCode, count, options: [{ vehCode, vehDesc, count }] }] — the claims disagree; not imported
 *   unresolved  [{ vehicle, count, exampleVin }] — vehicle text matches no loaded line
 *   invalid     [{ line, vin, error }]
 */
function deriveMappings(records, vehicles, now = new Date()) {
  const groups = new Map(); // wmi|body -> { wmi, bodyCode, byCode: Map(vehCode -> {count, vehDesc, gsa}), years:Set, example, count }
  const unresolved = new Map();
  const invalid = [];
  for (const r of records) {
    const p = parseVin(r.vin, now);
    if (!p.ok) { invalid.push({ line: r.line, vin: r.vin, error: p.error }); continue; }
    const v = resolveVehicle(r.vehicle, vehicles, r.gsa);
    if (!v || v.ambiguous) {
      const key = r.vehicle.trim().toUpperCase() || '(blank)';
      const u = unresolved.get(key) || { vehicle: r.vehicle.trim() || '(blank)', count: 0, exampleVin: p.vin, ambiguous: v ? v.ambiguous : undefined };
      u.count++; unresolved.set(key, u);
      continue;
    }
    const key = `${p.wmi}|${p.bodyCode}`;
    const g = groups.get(key) || { wmi: p.wmi, bodyCode: p.bodyCode, byCode: new Map(), years: new Set(), exampleVin: p.vin, count: 0 };
    const c = g.byCode.get(v.vehCode) || { vehCode: v.vehCode, vehDesc: v.vehDesc, gsa: v.gsa, count: 0 };
    c.count++; g.byCode.set(v.vehCode, c);
    g.count++; if (p.modelYear) g.years.add(p.modelYear);
    groups.set(key, g);
  }
  const rows = []; const conflicts = [];
  for (const g of groups.values()) {
    const options = [...g.byCode.values()].sort((a, b) => b.count - a.count);
    const base = { wmi: g.wmi, bodyCode: g.bodyCode, count: g.count, modelYears: [...g.years].sort(), exampleVin: g.exampleVin };
    if (options.length === 1) rows.push({ ...base, gsa: options[0].gsa, vehCode: options[0].vehCode, vehDesc: options[0].vehDesc });
    else conflicts.push({ ...base, options });
  }
  rows.sort((a, b) => b.count - a.count);
  conflicts.sort((a, b) => b.count - a.count);
  return {
    total: records.length, rows, conflicts,
    unresolved: [...unresolved.values()].sort((a, b) => b.count - a.count),
    invalid,
  };
}

module.exports = { parseClaimRecords, resolveVehicle, deriveMappings };

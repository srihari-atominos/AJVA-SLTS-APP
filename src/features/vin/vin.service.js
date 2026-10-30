/**
 * vin.service.js
 * VIN (chassis number) search: parse a VIN, find which loaded vehicle it
 * points at, and manage the admin-entered mapping rows.
 *
 * Reads the vehicle list and the extract-published codes through
 * vehiclesService (never that feature's repository) — the matching itself
 * is in-memory in decode.js, the data involved is a few hundred rows.
 */
const { makeVinRepository } = require('./vin.repository');
const { parseVin, matchVehicles } = require('./decode');
const { parseClaimRecords, deriveMappings } = require('./learn');

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

const BODY = /^[A-HJ-NPR-Z0-9]{3}$/;
const WMI_RE = /^[A-HJ-NPR-Z0-9]{3}$/;

function makeVinService(db, vehiclesService, auditService) {
  const repo = makeVinRepository(db);

  async function decode(rawVin, gsa) {
    const parsed = parseVin(rawVin);
    if (!parsed.ok) throw httpError(parsed.error, 400);
    const [vehicles, extractCodes, manualMaps] = await Promise.all([
      vehiclesService.listForDropdown(),
      vehiclesService.listVinCodes(),
      repo.listAll(),
    ]);
    const { matches, best, via } = matchVehicles(parsed, extractCodes, manualMaps, vehicles, gsa || null);
    return { ok: true, parsed, matches, best, via };
  }

  /** Normalise + validate one mapping row; throws 400 on a bad field. */
  function normalise(input) {
    const wmi = String(input.wmi || '').trim().toUpperCase() || null;
    const bodyCode = String(input.bodyCode || '').trim().toUpperCase();
    const gsa = String(input.gsa || '').trim().toUpperCase() || null;
    const vehCode = String(input.vehCode || '').trim().toUpperCase();
    const note = String(input.note || '').trim().slice(0, 255) || null;
    if (wmi && !WMI_RE.test(wmi)) throw httpError('WMI must be 3 letters/digits (positions 1-3 of the VIN), or blank for any', 400);
    if (!BODY.test(bodyCode)) throw httpError('Body code must be the 3 characters at VIN positions 5-7', 400);
    if (!vehCode) throw httpError('Vehicle code is required (e.g. TZ for Explorer, the code in the vehicle key IM-CHN-2023-TZ)', 400);
    return { wmi, bodyCode, gsa, vehCode, note };
  }

  async function listMaps() {
    const [rows, vehicles] = await Promise.all([repo.listAll(), vehiclesService.listForDropdown()]);
    // Attach the vehicles each row currently resolves to, so the admin can
    // see at a glance whether a row points at something that is loaded.
    return rows.map((r) => ({
      ...r,
      vehicles: vehicles
        .filter((v) => v.vehCode === r.vehCode && (!r.gsa || v.gsa === r.gsa))
        .map((v) => ({ vehKey: v.vehKey, vehDesc: v.vehDesc, modYear: v.modYear, gsa: v.gsa })),
    }));
  }

  async function addMap(input, user) {
    const m = normalise(input);
    if (await repo.findDuplicate(m)) throw httpError('That mapping already exists', 409);
    const { id } = await repo.insert({ ...m, createdBy: user ? user.email : null, createdAt: new Date().toISOString() });
    if (auditService) {
      await auditService.record({
        action: 'vinmap', mode: 'added',
        details: `VIN body code ${m.bodyCode}${m.wmi ? ` (WMI ${m.wmi})` : ''} -> vehicle code ${m.vehCode}${m.gsa ? ` (${m.gsa})` : ''}${m.note ? ` — ${m.note}` : ''}`,
      }, user);
    }
    return { id, ...m };
  }

  async function removeMap(id, user) {
    if (!Number.isInteger(id)) throw httpError('Invalid id', 400);
    const m = await repo.findById(id);
    if (!m) throw httpError('Mapping not found', 404);
    await repo.remove(id);
    if (auditService) {
      await auditService.record({
        action: 'vinmap', mode: 'removed',
        details: `VIN body code ${m.bodyCode}${m.wmi ? ` (WMI ${m.wmi})` : ''} -> vehicle code ${m.vehCode}${m.gsa ? ` (${m.gsa})` : ''} removed`,
      }, user);
    }
    return { ok: true };
  }

  /**
   * CSV text, one mapping per line. Either positional
   * (wmi,bodyCode,gsa,vehCode,note — wmi and gsa may be blank) or with a
   * header line naming the columns in any order (extra columns, e.g. the
   * count/example columns of the generated template, are ignored). Lines
   * with no vehicle code are skipped silently, so a half-filled template
   * can be imported as far as it goes; rows that fail validation or already
   * exist are reported, the rest are added.
   */
  async function bulkImport(csvText, user) {
    const lines = String(csvText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const result = { added: 0, skipped: [], ignored: 0 };
    const split = (l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    let cols = { wmi: 0, bodyCode: 1, gsa: 2, vehCode: 3, note: 4 };
    let start = 0;
    const head = lines.length ? split(lines[0]).map((c) => c.toLowerCase()) : [];
    if (head.some((c) => c === 'bodycode' || c === 'vehcode')) {
      const at = (name) => head.indexOf(name);
      cols = { wmi: at('wmi'), bodyCode: at('bodycode'), gsa: at('gsa'), vehCode: at('vehcode'), note: at('note') };
      start = 1;
    }
    const cell = (cells, i) => (i >= 0 && i < cells.length ? cells[i] : '');
    for (let i = start; i < lines.length; i++) {
      const cells = split(lines[i]);
      const row = {
        wmi: cell(cells, cols.wmi), bodyCode: cell(cells, cols.bodyCode), gsa: cell(cells, cols.gsa),
        vehCode: cell(cells, cols.vehCode), note: cell(cells, cols.note),
      };
      if (!row.vehCode) { result.ignored++; continue; }
      try {
        await addMap(row, user);
        result.added++;
      } catch (e) {
        result.skipped.push({ line: i + 1, text: lines[i], error: e.message });
      }
    }
    return result;
  }

  /**
   * Derive mapping rows from claim records (VIN + vehicle per line, see
   * learn.js). Returns the preview; with commit=true the unambiguous rows
   * are added too (rows that already exist are counted, not re-added).
   */
  async function learnFromClaims(csvText, { commit = false } = {}, user) {
    const records = parseClaimRecords(csvText);
    if (!records.length) throw httpError('Paste claim records first: one VIN and its vehicle per line', 400);
    const vehicles = await vehiclesService.listForDropdown();
    const result = deriveMappings(records, vehicles);
    if (!commit) return result;
    let added = 0; let existing = 0; const failed = [];
    for (const r of result.rows) {
      try {
        await addMap({ wmi: r.wmi, bodyCode: r.bodyCode, gsa: r.gsa, vehCode: r.vehCode, note: `learned from ${r.count} claim(s), e.g. ${r.exampleVin}` }, user);
        added++;
      } catch (e) {
        if (e.status === 409) existing++;
        else failed.push({ bodyCode: r.bodyCode, wmi: r.wmi, error: e.message });
      }
    }
    return { ...result, added, existing, failed };
  }

  return { decode, listMaps, addMap, removeMap, bulkImport, learnFromClaims };
}

module.exports = { makeVinService };

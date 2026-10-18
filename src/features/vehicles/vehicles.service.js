/**
 * vehicles.service.js
 * Business logic for vehicle extracts: listing, stats counts, the upload
 * upsert, and deletion.
 *
 * Upload upsert: if a vehicle with the same vehKey already exists, its old
 * vehicle/engine/transmission/feature/laborop rows are replaced (the XML is
 * a full snapshot for that vehicle line, so "update" means "replace with
 * this version").
 *
 * Takes `db` (the dbContext) directly, not a pre-built repository — it
 * needs to construct a repository bound to a TRANSACTION for the
 * upload/delete writes (db.transaction(...)), while ordinary reads use the
 * main pool. makeVehiclesRepository is a pure factory, so the same
 * function works for either.
 *
 * Cross-feature note: the upload transaction also inserts the extract's
 * labor-time rows, via laborOpsService.insertMany(rows, tx) — a service
 * call, not a repository reach-in, but given the SAME transaction-scoped
 * context, so both tables' writes commit or roll back together. This is
 * the one documented exception to "a feature never touches another
 * feature's data directly": it goes through laborOpsService's own exported
 * function, which itself builds a laborops repository from whatever
 * context it's given — it just happens to be given this transaction's
 * context instead of the main pool. Splitting a single upload's vehicle-row
 * and labor-row writes into two independent top-level transactions would
 * break the all-or-nothing guarantee this app relies on (verified: a
 * failed upload leaves no partial vehicle behind).
 */
const { makeVehiclesRepository } = require('./vehicles.repository');
const { flattenExtract } = require('./flatten');

function makeVehiclesService(db, laborOpsService) {
  const repo = makeVehiclesRepository(db);

  async function getStatsCounts() {
    const [count, years, markets] = await Promise.all([
      repo.count(), repo.distinctYears(), repo.distinctMarkets(),
    ]);
    return { count, years, markets };
  }

  function listForDropdown() {
    return repo.listForDropdown();
  }

  async function upsertVehicle(tx, vehicle, laborOps) {
    const txRepo = makeVehiclesRepository(tx);
    const existing = await txRepo.findByVehKey(vehicle.vehKey);
    const mode = existing ? 'updated' : 'added';

    if (existing) {
      await txRepo.deleteVehicleCascade(vehicle.vehKey, existing.id);
    }

    const vehicleId = await txRepo.insertVehicle(vehicle);
    for (const e of vehicle.engines || []) await txRepo.insertEngine(vehicleId, e);
    for (const t of vehicle.transmissions || []) await txRepo.insertTransmission(vehicleId, t);
    for (const f of vehicle.features || []) await txRepo.insertFeature(vehicleId, f);

    await laborOpsService.insertMany(laborOps, tx);

    return { mode, vehicleId };
  }

  async function importUploadedFile(file) {
    const name = file.originalname;
    const xml = file.buffer.toString('utf8');
    const parsed = flattenExtract(xml, { fileName: name, folder: 'uploaded' });
    if (!parsed) {
      return { fileName: name, ok: false, error: 'Not a recognizable PUBEXTRACT XML file' };
    }
    if (!parsed.vehicle.vehKey || parsed.vehicle.vehKey.includes('undefined')) {
      return { fileName: name, ok: false, error: 'Missing EXTRACTDETAILS/VEHLINEDATA fields needed to identify the vehicle' };
    }

    // Surface derivation fallbacks (e.g. a regional extract with no model
    // year in its description) in the server log AND the upload response,
    // so a new extract format is noticed at upload time, not months later.
    for (const w of parsed.warnings || []) console.warn(`[upload] ${w}`);

    try {
      const { mode } = await db.transaction((tx) => upsertVehicle(tx, parsed.vehicle, parsed.laborOps));
      return {
        fileName: name, ok: true, mode,
        vehKey: parsed.vehicle.vehKey, vehDesc: parsed.vehicle.vehDesc,
        modYear: parsed.vehicle.modYear, gsa: parsed.vehicle.gsa,
        prodStart: parsed.vehicle.prodStart, prodEnd: parsed.vehicle.prodEnd,
        laborOpCount: parsed.vehicle.laborOpCount, timeEntryCount: parsed.vehicle.timeEntryCount,
        warnings: parsed.warnings || [],
      };
    } catch (e) {
      return { fileName: name, ok: false, error: e.message };
    }
  }

  async function importUploadedFiles(files) {
    const results = [];
    for (const file of files) results.push(await importUploadedFile(file));
    return {
      added: results.filter((r) => r.ok && r.mode === 'added').length,
      updated: results.filter((r) => r.ok && r.mode === 'updated').length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async function deleteByVehKey(vehKey) {
    const existing = await repo.findByVehKey(vehKey);
    if (!existing) return null;
    await db.transaction(async (tx) => {
      await makeVehiclesRepository(tx).deleteVehicleCascade(vehKey, existing.id);
    });
    return { vehKey };
  }

  return { getStatsCounts, listForDropdown, importUploadedFiles, deleteByVehKey };
}

module.exports = { makeVehiclesService };

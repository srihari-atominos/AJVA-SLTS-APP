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

function makeVehiclesService(db, laborOpsService, auditService) {
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

  async function upsertVehicle(tx, vehicle, laborOps, user, fileName) {
    const txRepo = makeVehiclesRepository(tx);
    const existing = await txRepo.findByVehKey(vehicle.vehKey);
    const mode = existing ? 'updated' : 'added';

    // Diff the parsed rows against what the vehicle has NOW (before the
    // cascade delete below wipes it): marks each row added / modified /
    // unchanged for the UI and yields the counts for the audit log.
    const changes = await laborOpsService.markChanges(vehicle.vehKey, laborOps, tx);

    if (existing) {
      await txRepo.deleteVehicleCascade(vehicle.vehKey, existing.id);
    }

    const vehicleId = await txRepo.insertVehicle(vehicle);
    for (const e of vehicle.engines || []) await txRepo.insertEngine(vehicleId, e);
    for (const t of vehicle.transmissions || []) await txRepo.insertTransmission(vehicleId, t);
    for (const f of vehicle.features || []) await txRepo.insertFeature(vehicleId, f);

    await laborOpsService.insertMany(laborOps, tx);

    // Logged inside the same transaction, so the audit row exists exactly
    // when the data change committed and never for one that rolled back.
    const summary = existing
      ? `${laborOps.length} time entries: ${changes.added} new, ${changes.modified} time changed, ${changes.removed} removed, ${changes.unchanged} unchanged`
      : `${vehicle.laborOpCount} labor ops, ${laborOps.length} time entries (new vehicle)`;
    await auditService.record({
      action: 'import', mode, fileName,
      vehKey: vehicle.vehKey, vehDesc: vehicle.vehDesc,
      rowsAdded: changes.added, rowsModified: changes.modified, rowsRemoved: changes.removed,
      details: summary,
    }, user, tx);

    return { mode, changes, vehicleId };
  }

  async function importUploadedFile(file, user) {
    const name = file.originalname;
    const xml = file.buffer.toString('utf8');
    const parsed = flattenExtract(xml, { fileName: name, folder: 'uploaded' });
    if (!parsed) {
      await auditService.record({ action: 'import', mode: 'failed', fileName: name, details: 'Not a recognizable PUBEXTRACT XML file' }, user);
      return { fileName: name, ok: false, error: 'Not a recognizable PUBEXTRACT XML file' };
    }
    if (!parsed.vehicle.vehKey || parsed.vehicle.vehKey.includes('undefined')) {
      const error = 'Missing EXTRACTDETAILS/VEHLINEDATA fields needed to identify the vehicle';
      await auditService.record({ action: 'import', mode: 'failed', fileName: name, details: error }, user);
      return { fileName: name, ok: false, error };
    }

    // Surface derivation fallbacks (e.g. a regional extract with no model
    // year in its description) in the server log AND the upload response,
    // so a new extract format is noticed at upload time, not months later.
    for (const w of parsed.warnings || []) console.warn(`[upload] ${w}`);

    try {
      const { mode, changes } = await db.transaction((tx) => upsertVehicle(tx, parsed.vehicle, parsed.laborOps, user, name));
      return {
        fileName: name, ok: true, mode,
        vehKey: parsed.vehicle.vehKey, vehDesc: parsed.vehicle.vehDesc,
        modYear: parsed.vehicle.modYear, gsa: parsed.vehicle.gsa,
        prodStart: parsed.vehicle.prodStart, prodEnd: parsed.vehicle.prodEnd,
        laborOpCount: parsed.vehicle.laborOpCount, timeEntryCount: parsed.vehicle.timeEntryCount,
        rowsAdded: changes.added, rowsModified: changes.modified, rowsRemoved: changes.removed, rowsUnchanged: changes.unchanged,
        warnings: parsed.warnings || [],
      };
    } catch (e) {
      await auditService.record({
        action: 'import', mode: 'failed', fileName: name,
        vehKey: parsed.vehicle.vehKey, vehDesc: parsed.vehicle.vehDesc, details: e.message,
      }, user);
      return { fileName: name, ok: false, error: e.message };
    }
  }

  async function importUploadedFiles(files, user) {
    const results = [];
    for (const file of files) results.push(await importUploadedFile(file, user));
    return {
      added: results.filter((r) => r.ok && r.mode === 'added').length,
      updated: results.filter((r) => r.ok && r.mode === 'updated').length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async function deleteByVehKey(vehKey, user) {
    const existing = await repo.findByVehKey(vehKey);
    if (!existing) return null;
    let rowsRemoved = 0;
    await db.transaction(async (tx) => {
      const txRepo = makeVehiclesRepository(tx);
      rowsRemoved = await txRepo.countLaborOps(vehKey);
      await txRepo.deleteVehicleCascade(vehKey, existing.id);
      await auditService.record({
        action: 'delete', mode: 'deleted', vehKey, vehDesc: existing.vehDesc, rowsRemoved,
        details: `vehicle and its ${rowsRemoved} time entries deleted`,
      }, user, tx);
    });
    return { vehKey, rowsRemoved };
  }

  return { getStatsCounts, listForDropdown, importUploadedFiles, deleteByVehKey };
}

module.exports = { makeVehiclesService };

/**
 * vehicles.repository.js
 * All direct SQL for vehicles + its child tables (engines, transmissions,
 * features — part of the same vehicle aggregate, not separate features),
 * via the uniform dbContext (works against SQLite or MSSQL).
 *
 * Takes a dbContext instance, not a raw driver handle — the SAME factory
 * is called once with the main pool context (for ordinary reads) and again
 * with a transaction-scoped context (for the upload/delete writes), so the
 * identical SQL runs correctly either way. See vehicles.service.js.
 */
function makeVehiclesRepository(db) {
  return {
    listForDropdown: () => db.all(`
      SELECT id, vehKey, fileName, folder, source, gsa, language, modYear, prodType,
             prodStart, prodEnd, vehCode, vehDesc, abbr, brandCode, laborOpCount, timeEntryCount
      FROM vehicles ORDER BY modYear, vehDesc
    `, []),

    findByVehKey: (vehKey) => db.get('SELECT id, vehDesc FROM vehicles WHERE vehKey = ?', [vehKey]),
    // How many labor-time rows a vehicle currently has — recorded in the
    // audit log as "rows removed" before an upload replaces or a delete
    // removes them.
    countLaborOps: async (vehKey) => (await db.get('SELECT COUNT(*) AS n FROM laborops WHERE vehKey = ?', [vehKey])).n,
    count: async () => (await db.get('SELECT COUNT(*) AS n FROM vehicles', [])).n,
    // A vehicle whose description carries no model year at all (see
    // vehicleMeta.js) has modYear NULL — it stays listable but is not a
    // year-filter option.
    distinctYears: async () => (await db.all('SELECT DISTINCT modYear FROM vehicles WHERE modYear IS NOT NULL ORDER BY modYear', [])).map((r) => r.modYear),
    distinctMarkets: async () => (await db.all('SELECT DISTINCT gsa FROM vehicles WHERE gsa IS NOT NULL', [])).map((r) => r.gsa),

    async deleteVehicleCascade(vehKey, vehicleId) {
      await db.run('DELETE FROM laborops WHERE vehKey = ?', [vehKey]);
      await db.run('DELETE FROM engines WHERE vehicleId = ?', [vehicleId]);
      await db.run('DELETE FROM transmissions WHERE vehicleId = ?', [vehicleId]);
      await db.run('DELETE FROM features WHERE vehicleId = ?', [vehicleId]);
      await db.run('DELETE FROM vehicle_vin_codes WHERE vehicleId = ?', [vehicleId]);
      await db.run('DELETE FROM vehicles WHERE id = ?', [vehicleId]);
    },

    async insertVehicle(v) {
      const { id } = await db.insert(
        `INSERT INTO vehicles
          (vehKey, fileName, folder, source, gsa, language, modYear, prodType, extractId, extractDate,
           vehCode, vehDesc, abbr, brandCode, laborOpCount, timeEntryCount, prodStart, prodEnd)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          v.vehKey, v.fileName, v.folder, v.source, v.gsa, v.language, v.modYear, v.prodType,
          String(v.extractId ?? ''), v.extractDate, v.vehCode, v.vehDesc, v.abbr, v.brandCode,
          v.laborOpCount, v.timeEntryCount, v.prodStart ?? null, v.prodEnd ?? null,
        ]
      );
      return id;
    },

    insertEngine: (vehicleId, e) => db.run('INSERT INTO engines VALUES (?,?,?,?,?)',
      [vehicleId, e.engCode ?? null, e.desc ?? null, e.abbr ?? null, e.numCyl ?? null]),
    insertTransmission: (vehicleId, t) => db.run('INSERT INTO transmissions VALUES (?,?,?,?)',
      [vehicleId, t.code ?? null, t.desc ?? null, t.typeInd ?? null]),
    insertFeature: (vehicleId, f) => db.run('INSERT INTO features VALUES (?,?,?,?)',
      [vehicleId, f.family ?? null, f.feature ?? null, f.desc ?? null]),

    // "VIN positions 5-7 -> vehicle line" rows the extract publishes (see
    // flatten.js); part of the vehicle aggregate like engines/features.
    insertVinCode: (vehicleId, v, c) => db.run(
      `INSERT INTO vehicle_vin_codes
        (vehicleId, vehKey, gsa, modYear, vehCode, bodyCode, bodyTypeCode, bodyStyleCode, modelCode, modelDesc, bodyStyleDesc, bodyTypeDesc)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [vehicleId, v.vehKey, v.gsa ?? null, v.modYear ?? null, c.vehCode ?? v.vehCode, c.bodyCode,
       c.bodyTypeCode ?? null, c.bodyStyleCode ?? null, c.modelCode ?? null,
       c.modelDesc ?? null, c.bodyStyleDesc ?? null, c.bodyTypeDesc ?? null]
    ),
    deleteVinCodes: (vehicleId) => db.run('DELETE FROM vehicle_vin_codes WHERE vehicleId = ?', [vehicleId]),
    listVinCodes: () => db.all(
      `SELECT vehKey, gsa, modYear, vehCode, bodyCode, bodyTypeCode, bodyStyleCode, modelCode, modelDesc, bodyStyleDesc, bodyTypeDesc
         FROM vehicle_vin_codes ORDER BY bodyCode, vehKey`, []
    ),
  };
}

module.exports = { makeVehiclesRepository };

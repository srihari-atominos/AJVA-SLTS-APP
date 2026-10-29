/**
 * vin.repository.js
 * All direct SQL for the vin_map table (admin-entered VIN body code ->
 * vehicle line rows), via the uniform dbContext.
 */
function makeVinRepository(db) {
  return {
    listAll: () => db.all(
      'SELECT id, wmi, bodyCode, gsa, vehCode, note, createdBy, createdAt FROM vin_map ORDER BY bodyCode, wmi, gsa, vehCode', []
    ),

    findById: (id) => db.get('SELECT id, wmi, bodyCode, gsa, vehCode, note FROM vin_map WHERE id = ?', [id]),

    // Same WMI (or both blank), body code, market (or both blank) and vehicle code.
    findDuplicate: (m) => db.get(
      `SELECT id FROM vin_map
        WHERE bodyCode = ? AND vehCode = ?
          AND ((wmi IS NULL AND ? IS NULL) OR wmi = ?)
          AND ((gsa IS NULL AND ? IS NULL) OR gsa = ?)`,
      [m.bodyCode, m.vehCode, m.wmi, m.wmi, m.gsa, m.gsa]
    ),

    insert: (m) => db.insert(
      'INSERT INTO vin_map (wmi, bodyCode, gsa, vehCode, note, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)',
      [m.wmi, m.bodyCode, m.gsa, m.vehCode, m.note, m.createdBy, m.createdAt]
    ),

    remove: (id) => db.run('DELETE FROM vin_map WHERE id = ?', [id]),
  };
}

module.exports = { makeVinRepository };

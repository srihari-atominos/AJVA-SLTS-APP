/**
 * laborops.repository.js
 * All direct SQL for the laborops table, via the uniform dbContext (works
 * against SQLite or MSSQL). Includes the dynamic filter builder — kept
 * here, not in the service, because assembling the WHERE clause is a
 * data-access concern: it only ever combines trusted column names/
 * operators into the SQL text, with every actual value still bound through
 * parameterized `?` placeholders (never string-concatenated).
 *
 * Pagination is the one genuinely dialect-specific query here (SQLite's
 * `LIMIT ? OFFSET ?` vs MSSQL's `OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
 * which also requires an ORDER BY — already present in both cases).
 *
 * Takes a dbContext instance, not a raw driver handle — called once with
 * the main pool context, and again with a transaction-scoped context when
 * vehicles.service.js inserts an uploaded extract's labor-time rows inside
 * its own transaction (see that file's header comment).
 */
function buildWhere(filters) {
  const { vehKey, modYear, gsa, q, exact } = filters;
  const where = [];
  const params = [];
  if (vehKey) { where.push('vehKey = ?'); params.push(vehKey); }
  if (modYear) { where.push('modYear = ?'); params.push(modYear); }
  if (gsa) { where.push('gsa = ?'); params.push(gsa); }
  if (q && q.trim()) {
    if (exact) {
      // Exact code match on the full claimable op code only (case-insensitive).
      // Matching laborDescCode/baseLaborOp instead would pull in every variant again,
      // since e.g. "1006D" is itself the base code for the whole 1006D/1006DXQ/... family.
      where.push('UPPER(fullLaborOpCode) = ?');
      params.push(q.trim().toUpperCase());
    } else {
      const like = `%${q.trim()}%`;
      where.push('(operationDesc LIKE ? OR laborDescCode LIKE ? OR fullLaborOpCode LIKE ? OR secDesc LIKE ?)');
      params.push(like, like, like, like);
    }
  }
  return { whereSql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function makeLaborOpsRepository(db) {
  const insertSql = `INSERT INTO laborops
    (vehKey, source, gsa, modYear, vehDesc, brandCode, laborDescCode, baseLaborOp, combo,
     complexCode, operationDesc, operType, secNo, secDesc, tsid, effectiveDate, status,
     fullLaborOpCode, totTime, categoryCode, catDesc, qualDesc, assessedTime)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;

  return {
    countAll: async () => (await db.get('SELECT COUNT(*) AS n FROM laborops', [])).n,

    insertOne: (o) => db.run(insertSql, [
      o.vehKey, o.source, o.gsa, o.modYear, o.vehDesc, o.brandCode,
      o.laborDescCode ?? null, o.baseLaborOp ?? null, o.combo ?? null,
      o.complexCode ?? null, o.operationDesc ?? null, o.operType ?? null,
      o.secNo ?? null, o.secDesc ?? null, String(o.tsid ?? ''), o.effectiveDate ?? null,
      o.status ?? null, o.fullLaborOpCode ?? null, o.totTime, o.categoryCode ?? null,
      o.catDesc, o.qualDesc, o.assessedTime ?? null,
    ]),

    findById: (id) => db.get('SELECT id FROM laborops WHERE id = ?', [id]),
    findFullById: (id) => db.get('SELECT * FROM laborops WHERE id = ?', [id]),
    updateTotTime: (id, n) => db.run('UPDATE laborops SET totTime = ? WHERE id = ?', [n, id]),

    async countFiltered(filters) {
      const { whereSql, params } = buildWhere(filters);
      return (await db.get(`SELECT COUNT(*) AS n FROM laborops ${whereSql}`, params)).n;
    },

    listPage(filters, limit, offset) {
      const { whereSql, params } = buildWhere(filters);
      const orderBy = 'ORDER BY laborDescCode, fullLaborOpCode';
      if (db.driver === 'mssql') {
        return db.all(
          `SELECT * FROM laborops ${whereSql} ${orderBy} OFFSET ? ROWS FETCH NEXT ? ROWS ONLY`,
          [...params, offset, limit]
        );
      }
      return db.all(
        `SELECT * FROM laborops ${whereSql} ${orderBy} LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
    },

    listAllMatching(filters) {
      const { whereSql, params } = buildWhere(filters);
      return db.all(`SELECT * FROM laborops ${whereSql} ORDER BY laborDescCode, fullLaborOpCode`, params);
    },

    lookupByCode(code, vehKey) {
      const where = ['fullLaborOpCode = ?'];
      const params = [code];
      if (vehKey) { where.push('vehKey = ?'); params.push(vehKey); }
      return db.all(`SELECT * FROM laborops WHERE ${where.join(' AND ')} ORDER BY vehKey`, params);
    },
  };
}

module.exports = { makeLaborOpsRepository };

/**
 * laborops.controller.js
 * Translates HTTP requests into laborops.service calls.
 */
function handleServiceError(res, err) {
  res.status(err.status || 500).json({ error: err.message || 'Unexpected error' });
}

function makeLaborOpsController(service) {
  return {
    async list(req, res) {
      res.json(await service.listPage(req.query));
    },

    async exportCsv(req, res) {
      const { columns, rows, csvEscape } = await service.exportCsvRows(req.query);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="laborops-${stamp}.csv"`);
      res.write(columns.join(',') + '\r\n');
      for (const r of rows) res.write(columns.map((c) => csvEscape(r[c])).join(',') + '\r\n');
      res.end();
    },

    async lookup(req, res) {
      try {
        res.json(await service.lookup(req.query.code, req.query.vehKey));
      } catch (err) { handleServiceError(res, err); }
    },

    async editTotTime(req, res) {
      try {
        const row = await service.editTotTime(parseInt(req.params.id, 10), (req.body || {}).totTime, req.user);
        res.json({ ok: true, row });
      } catch (err) { handleServiceError(res, err); }
    },
  };
}

module.exports = { makeLaborOpsController };

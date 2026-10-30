/**
 * vin.controller.js
 * Translates HTTP requests into vin.service calls.
 */
function handleServiceError(res, err) {
  res.status(err.status || 500).json({ ok: false, error: err.message || 'Unexpected error' });
}

function makeVinController(service) {
  return {
    async decode(req, res) {
      try {
        res.json(await service.decode(req.query.vin, req.query.gsa || null));
      } catch (err) { handleServiceError(res, err); }
    },

    async list(req, res) {
      res.json(await service.listMaps());
    },

    async add(req, res) {
      try {
        res.json({ ok: true, mapping: await service.addMap(req.body || {}, req.user) });
      } catch (err) { handleServiceError(res, err); }
    },

    async bulk(req, res) {
      try {
        res.json({ ok: true, ...(await service.bulkImport((req.body || {}).csv, req.user)) });
      } catch (err) { handleServiceError(res, err); }
    },

    async learn(req, res) {
      try {
        const body = req.body || {};
        res.json({ ok: true, ...(await service.learnFromClaims(body.csv, { commit: body.commit === true }, req.user)) });
      } catch (err) { handleServiceError(res, err); }
    },

    async remove(req, res) {
      try {
        res.json(await service.removeMap(parseInt(req.params.id, 10), req.user));
      } catch (err) { handleServiceError(res, err); }
    },
  };
}

module.exports = { makeVinController };

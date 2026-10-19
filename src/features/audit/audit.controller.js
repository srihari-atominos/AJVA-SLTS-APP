/**
 * audit.controller.js
 * Translates HTTP requests into audit.service calls.
 */
function makeAuditController(service) {
  return {
    async list(req, res) {
      res.json(await service.list(req.query));
    },

    async lastUpdated(req, res) {
      res.json({ lastUpdated: await service.lastUpdated() });
    },
  };
}

module.exports = { makeAuditController };

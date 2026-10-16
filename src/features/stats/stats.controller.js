/**
 * stats.controller.js
 */
function makeStatsController(service) {
  return {
    async get(req, res) {
      res.json(await service.getStats());
    },
  };
}

module.exports = { makeStatsController };

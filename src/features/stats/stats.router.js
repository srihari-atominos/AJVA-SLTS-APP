/**
 * stats.router.js
 * Mounts GET /api/stats. Takes vehiclesService and laborOpsService as
 * dependencies, composed in app.js.
 *
 * Wrapped in asyncHandler — see its header comment for why that's not
 * optional (an unwrapped async handler's rejection crashes the whole
 * server process under Express 4, not just that one request — this is
 * literally the route that first exposed the bug: a concurrent read here
 * during a long-running MSSQL import timed out and took the server down).
 */
const express = require('express');
const { asyncHandler } = require('../../middlewares/asyncHandler');
const { makeStatsService } = require('./stats.service');
const { makeStatsController } = require('./stats.controller');

function makeStatsRouter(rbac, vehiclesService, laborOpsService) {
  const router = express.Router();
  const service = makeStatsService(vehiclesService, laborOpsService);
  const controller = makeStatsController(service);

  router.get('/api/stats', rbac.requireAuth, asyncHandler(controller.get));

  return router;
}

module.exports = { makeStatsRouter };

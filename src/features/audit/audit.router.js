/**
 * audit.router.js
 * Mounts GET /api/audit (Admin and above: the full log, paginated) and
 * GET /api/audit/last-updated (any signed-in user: the one line shown in
 * the page header). Returns { router, service } — app.js hands the
 * service to the vehicles and laborops routers so their writes get logged.
 *
 * Every handler is wrapped in asyncHandler — see its header comment.
 */
const express = require('express');
const { asyncHandler } = require('../../middlewares/asyncHandler');
const { makeAuditService } = require('./audit.service');
const { makeAuditController } = require('./audit.controller');

function makeAuditRouter(db, rbac) {
  const router = express.Router();
  const { requireAuth, requireRole } = rbac;

  const service = makeAuditService(db);
  const controller = makeAuditController(service);

  router.get('/api/audit/last-updated', requireAuth, asyncHandler(controller.lastUpdated));
  router.get('/api/audit', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.list));

  return { router, service };
}

module.exports = { makeAuditRouter };

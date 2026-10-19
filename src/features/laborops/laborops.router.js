/**
 * laborops.router.js
 * Mounts /api/laborops, /api/laborops/export, /api/lookup, and the
 * totTime-only PATCH. Returns { router, service } — app.js needs the
 * service too, since vehicles (labor-op inserts on upload) and stats
 * (row count) call across into it.
 *
 * Every handler is wrapped in asyncHandler — see its header comment for
 * why that's not optional (an unwrapped async handler's rejection crashes
 * the whole server process under Express 4, not just that one request).
 */
const express = require('express');
const { asyncHandler } = require('../../middlewares/asyncHandler');
const { makeLaborOpsService } = require('./laborops.service');
const { makeLaborOpsController } = require('./laborops.controller');

function makeLaborOpsRouter(db, rbac, auditService) {
  const router = express.Router();
  const { requireAuth, requireRole } = rbac;

  const service = makeLaborOpsService(db, auditService);
  const controller = makeLaborOpsController(service);

  router.get('/api/laborops', requireAuth, asyncHandler(controller.list));
  router.get('/api/laborops/export', requireAuth, asyncHandler(controller.exportCsv));
  router.get('/api/lookup', requireAuth, asyncHandler(controller.lookup));

  // Edit a single labor-time entry — intentionally the ONLY per-row write
  // exposed anywhere in this feature; see laborops.service.js's editTotTime.
  router.patch('/api/laborops/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.editTotTime));

  return { router, service };
}

module.exports = { makeLaborOpsRouter };

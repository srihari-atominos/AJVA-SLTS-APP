/**
 * vehicles.router.js
 * Mounts /api/vehicles, /api/upload, and DELETE /api/vehicles/:vehKey.
 * Takes laborOpsService as a dependency (for inserting an uploaded
 * extract's labor-time rows) — composed in app.js, not reached into
 * directly by this feature. Returns { router, service } since stats needs
 * the service's getStatsCounts().
 *
 * Every handler is wrapped in asyncHandler — see its header comment for
 * why that's not optional (an unwrapped async handler's rejection crashes
 * the whole server process under Express 4, not just that one request).
 */
const express = require('express');
const config = require('../../config');
const { asyncHandler } = require('../../middlewares/asyncHandler');
const { upload } = require('./upload.middleware');
const { makeVehiclesService } = require('./vehicles.service');
const { makeVehiclesController } = require('./vehicles.controller');

function makeVehiclesRouter(db, rbac, laborOpsService, auditService) {
  const router = express.Router();
  const { requireAuth, requireRole } = rbac;

  const service = makeVehiclesService(db, laborOpsService, auditService);
  const controller = makeVehiclesController(service);

  router.get('/api/vehicles', requireAuth, asyncHandler(controller.list));
  router.post(
    '/api/upload',
    requireRole('ADMIN', 'SUPER_ADMIN'),
    upload.array('files', config.upload.maxFiles),
    asyncHandler(controller.upload)
  );
  router.delete('/api/vehicles/:vehKey', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.remove));

  return { router, service };
}

module.exports = { makeVehiclesRouter };

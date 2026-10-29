/**
 * vin.router.js
 * Mounts the VIN search (any signed-in user) and the mapping-table
 * management (Admin and above):
 *   GET    /api/vin/decode?vin=...&gsa=   parse a VIN and find the vehicle(s) it points at
 *   GET    /api/vin/map                   the admin-entered mapping rows (+ which vehicles they hit)
 *   POST   /api/vin/map                   add one { wmi?, bodyCode, gsa?, vehCode, note? }
 *   POST   /api/vin/map/bulk              add many from CSV text { csv }
 *   DELETE /api/vin/map/:id
 *
 * Every handler is wrapped in asyncHandler — see its header comment.
 */
const express = require('express');
const { asyncHandler } = require('../../middlewares/asyncHandler');
const { makeVinService } = require('./vin.service');
const { makeVinController } = require('./vin.controller');

function makeVinRouter(db, rbac, vehiclesService, auditService) {
  const router = express.Router();
  const { requireAuth, requireRole } = rbac;

  const service = makeVinService(db, vehiclesService, auditService);
  const controller = makeVinController(service);

  router.get('/api/vin/decode', requireAuth, asyncHandler(controller.decode));
  router.get('/api/vin/map', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.list));
  router.post('/api/vin/map', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.add));
  router.post('/api/vin/map/bulk', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.bulk));
  router.delete('/api/vin/map/:id', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.remove));

  return { router, service };
}

module.exports = { makeVinRouter };

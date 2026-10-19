/**
 * app.js
 * Express app assembly: global middleware, every feature's router mounted,
 * static pages, global error handler. No app.listen here — that's server.js
 * (keeps the app importable/testable without actually binding a port).
 */
const path = require('path');
const express = require('express');
const config = require('./config');
const { createSessionMiddleware } = require('./config/session');
const { makeRbac } = require('./middlewares/rbac');
const { errorHandler } = require('./middlewares/errorHandler');
const { makeUsersRouter } = require('./features/users/users.router');
const { makeLaborOpsRouter } = require('./features/laborops/laborops.router');
const { makeVehiclesRouter } = require('./features/vehicles/vehicles.router');
const { makeStatsRouter } = require('./features/stats/stats.router');
const { makeAuditRouter } = require('./features/audit/audit.router');

function createApp(db) {
  const app = express();
  app.use(express.json());
  app.use(createSessionMiddleware(db));

  // Public liveness/readiness check: a container orchestrator (Docker's
  // own restart policy via HEALTHCHECK, Kubernetes, etc.) polls this to
  // know whether this instance's DB connection is actually usable. Needed
  // because a lost connection pool doesn't self-heal on its own (confirmed
  // by testing: stopping and restarting the DB left the pool permanently
  // broken until the app process itself restarted) — this endpoint is what
  // lets the orchestration layer detect that and cycle the container,
  // rather than it silently staying up but degraded forever.
  app.get('/health', async (req, res) => {
    try {
      await db.get('SELECT 1 AS ok', []);
      res.json({ ok: true, driver: config.db.driver });
    } catch (err) {
      res.status(503).json({ ok: false, error: err.message });
    }
  });

  const rbac = makeRbac(db);
  const { requireAuth, requireRole } = rbac;

  // Feature routers. laborops and vehicles export their service alongside
  // their router so stats (and vehicles, for labor-op inserts on upload)
  // can call across features without reaching into another feature's
  // repository — that composition happens here, not inside a feature.
  // Audit first: every data-changing feature (upload/delete in vehicles,
  // the time edit in laborops) records through its service.
  const { router: auditRouter, service: auditService } = makeAuditRouter(db, rbac);
  const { router: laborOpsRouter, service: laborOpsService } = makeLaborOpsRouter(db, rbac, auditService);
  const { router: vehiclesRouter, service: vehiclesService } = makeVehiclesRouter(db, rbac, laborOpsService, auditService);
  const statsRouter = makeStatsRouter(rbac, vehiclesService, laborOpsService);

  app.use(makeUsersRouter(db, rbac));
  app.use(auditRouter);
  app.use(laborOpsRouter);
  app.use(vehiclesRouter);
  app.use(statsRouter);

  // Page-level gates must be registered before express.static, since Express
  // matches routes in registration order and static would otherwise serve
  // these files to anyone who requests them directly by name.
  app.get('/', requireAuth, (req, res) => res.sendFile(path.join(config.publicDir, 'index.html')));
  app.get('/users.html', requireRole('ADMIN', 'SUPER_ADMIN'), (req, res) => res.sendFile(path.join(config.publicDir, 'users.html')));
  app.get('/audit.html', requireRole('ADMIN', 'SUPER_ADMIN'), (req, res) => res.sendFile(path.join(config.publicDir, 'audit.html')));

  // Remaining static files: login.html, signup.html are intentionally public.
  app.use(express.static(config.publicDir, { index: false }));

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };

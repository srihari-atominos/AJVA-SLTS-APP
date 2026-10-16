/**
 * users.router.js
 * Mounts /auth/* (signup, login, logout, SSO, SAML, link-windows, me,
 * public-config) and /api/users/* (list, role, status). Wiring only —
 * business logic lives in the service, HTTP translation lives in the
 * controller.
 *
 * Every handler is wrapped in asyncHandler — without it, a rejected
 * promise from an async handler (any real database error) crashes the
 * whole server process instead of just failing that one request. See
 * asyncHandler.js's header for how this was actually caught.
 */
const express = require('express');
const sso = require('./sso');
const saml = require('./saml');
const { asyncHandler } = require('../../middlewares/asyncHandler');
const { makeUsersRepository } = require('./users.repository');
const { makeUsersService } = require('./users.service');
const { makeUsersController } = require('./users.controller');

// SAML IdPs POST the assertion as application/x-www-form-urlencoded —
// scoped to just the callback route, not applied globally.
const urlencoded = express.urlencoded({ extended: false });

function makeUsersRouter(db, rbac) {
  const router = express.Router();
  const { requireAuth, requireRole } = rbac;

  const repo = makeUsersRepository(db);
  const service = makeUsersService(repo);
  const controller = makeUsersController(service);

  router.post('/auth/signup', asyncHandler(controller.signup));
  router.post('/auth/login', asyncHandler(controller.login));
  router.post('/auth/logout', asyncHandler(controller.logout));
  router.get('/auth/public-config', asyncHandler(controller.publicConfig));
  router.get('/auth/me', asyncHandler(controller.me));

  // ---- Windows SSO (on-prem AD, via native SSPI — Kerberos/NTLM) ----
  if (sso.active) {
    router.get('/auth/sso', sso.authMiddleware(), asyncHandler(controller.ssoCallback));
    // Self-service: a signed-in user links THEIR OWN Windows identity to
    // their own account, so next time they can skip the password form.
    // Deliberately self-service, not an admin typing 'domain\username' by
    // hand into a text box — that's error-prone and this is the identity
    // the handshake actually proves.
    router.get('/auth/link-windows', requireAuth, sso.authMiddleware(), asyncHandler(controller.linkWindows));
  } else {
    router.get('/auth/sso', (req, res) => res.redirect('/login.html?sso=unavailable'));
    router.get('/auth/link-windows', requireAuth, (req, res) => res.redirect('/?link=unavailable'));
  }

  // ---- SAML SSO (federated — non-domain devices, or an existing enterprise IdP) ----
  if (saml.active) {
    router.get('/auth/saml/login', asyncHandler(controller.samlLogin));
    router.post('/auth/saml/callback', urlencoded, asyncHandler(controller.samlCallback));
  } else {
    router.get('/auth/saml/login', (req, res) => res.redirect('/login.html?saml=unavailable'));
  }

  // ---- User management (ADMIN + SUPER_ADMIN can view; see service for per-action guardrails) ----
  router.get('/api/users', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.list));
  router.patch('/api/users/:id/role', requireRole('SUPER_ADMIN'), asyncHandler(controller.changeRole));
  router.patch('/api/users/:id/status', requireRole('ADMIN', 'SUPER_ADMIN'), asyncHandler(controller.changeStatus));

  return router;
}

module.exports = { makeUsersRouter };

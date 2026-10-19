/**
 * users.controller.js
 * Translates HTTP requests into users.service calls and maps results/errors
 * back to responses. Route wiring lives in users.router.js; business rules
 * (including the role/status guardrails) live in users.service.js.
 */
const config = require('../../config');
const sso = require('./sso');
const saml = require('./saml');
const { toPublicUser } = require('./users.service');

function handleServiceError(res, err) {
  res.status(err.status || 500).json({ error: err.message || 'Unexpected error' });
}

function makeUsersController(service) {
  return {
    async signup(req, res) {
      try {
        const user = await service.signup(req.body || {});
        req.session.userId = user.id;
        res.json({ ok: true, user: toPublicUser(user) });
      } catch (err) { handleServiceError(res, err); }
    },

    async login(req, res) {
      try {
        const user = await service.loginWithPassword(req.body || {});
        req.session.userId = user.id;
        res.json({ ok: true, user: toPublicUser(user) });
      } catch (err) { handleServiceError(res, err); }
    },

    logout(req, res) {
      req.session.destroy(() => res.json({ ok: true }));
    },

    publicConfig(req, res) {
      res.json({
        appName: config.APP_NAME,
        passwordMinLength: config.auth.passwordMinLength,
        maxLaborHours: config.laborTime.maxHours,
        changeHighlightDays: config.laborTime.changeHighlightDays,
        samlEnabled: config.saml.enabled,
      });
    },

    async me(req, res) {
      const uid = req.session && req.session.userId;
      const u = uid ? await service.getById(uid) : null;
      res.json({ user: u && u.status === 'active' ? toPublicUser(u) : null, ssoAvailable: sso.active });
    },

    async ssoCallback(req, res) {
      const identity = req.sso && req.sso.user;
      const result = await service.matchWindowsIdentity(identity);
      if (result.user) {
        req.session.userId = result.user.id;
        return res.redirect('/');
      }
      res.redirect(`/login.html?sso=${result.reason}`);
    },

    async linkWindows(req, res) {
      const identity = req.sso && req.sso.user;
      const result = await service.linkWindowsIdentity(req.user.id, identity);
      res.redirect(result.ok ? '/?link=ok' : `/?link=${result.reason}`);
    },

    async samlLogin(req, res) {
      try {
        const url = await saml.getLoginUrl();
        res.redirect(url);
      } catch (err) {
        res.redirect('/login.html?saml=failed');
      }
    },

    // SAML ACS (Assertion Consumer Service) callback — the IdP POSTs the
    // signed assertion here after a successful federated login.
    // saml.verifyAssertion checks the signature/expiry/audience and
    // extracts the profile; only then is the user looked up/provisioned.
    async samlCallback(req, res) {
      try {
        const { email, name } = await saml.verifyAssertion(req.body);
        const user = await service.loginWithSaml({ email, name });
        req.session.userId = user.id;
        res.redirect('/');
      } catch (err) {
        res.redirect('/login.html?saml=failed');
      }
    },

    async list(req, res) {
      res.json((await service.listAll()).map(toPublicUser));
    },

    async changeRole(req, res) {
      try {
        const user = await service.changeRole(parseInt(req.params.id, 10), (req.body || {}).role);
        res.json({ ok: true, user: toPublicUser(user) });
      } catch (err) { handleServiceError(res, err); }
    },

    async changeStatus(req, res) {
      try {
        const user = await service.changeStatus(req.user, parseInt(req.params.id, 10), (req.body || {}).status);
        res.json({ ok: true, user: toPublicUser(user) });
      } catch (err) { handleServiceError(res, err); }
    },
  };
}

module.exports = { makeUsersController };

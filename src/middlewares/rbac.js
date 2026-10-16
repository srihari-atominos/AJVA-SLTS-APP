/**
 * rbac.js
 * requireAuth: any active, logged-in user (SUPER_ADMIN, ADMIN, or USER).
 * requireRole(...roles): requireAuth, then restricts to the given roles.
 * API routes (/api/..., /auth/...) get a 401/403 JSON body; page routes
 * (anything else, e.g. '/') get redirected to the login page instead.
 *
 * Global middleware (src/middlewares/, not inside one feature) because
 * every feature's router depends on it — the "scope of use" rule promotes
 * anything used by two or more features out of a single feature folder.
 *
 * Async throughout: the user lookup goes through the dbContext (see
 * src/config/dbContext.js), which is a real network round-trip under the
 * MSSQL driver, not just a local file read.
 */
function makeRbac(db) {
  async function loadCurrentUser(req) {
    const uid = req.session && req.session.userId;
    if (!uid) return null;
    const u = await db.get('SELECT * FROM users WHERE id = ?', [uid]);
    if (!u || u.status !== 'active') return null;
    return u;
  }

  function isApiPath(req) {
    return req.path.startsWith('/api/') || req.path.startsWith('/auth/');
  }

  async function requireAuth(req, res, next) {
    try {
      const user = await loadCurrentUser(req);
      if (!user) {
        if (isApiPath(req)) return res.status(401).json({ error: 'Not signed in' });
        return res.redirect('/login.html');
      }
      req.user = user;
      next();
    } catch (err) { next(err); }
  }

  function requireRole(...roles) {
    return (req, res, next) => {
      requireAuth(req, res, (err) => {
        if (err) return next(err);
        if (!req.user) return; // requireAuth already responded
        if (!roles.includes(req.user.role)) {
          if (isApiPath(req)) return res.status(403).json({ error: 'Not permitted for your role' });
          return res.status(403).send('Not permitted for your role.');
        }
        next();
      });
    };
  }

  return { requireAuth, requireRole, loadCurrentUser };
}

module.exports = { makeRbac };

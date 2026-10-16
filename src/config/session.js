/**
 * session.js
 * Express-session middleware, backed by the SQLite 'sessions' table (see
 * features/users/sessionStore.js). Treated as global infra, like the
 * original company rules' "src/config/socket.js" initializer pattern —
 * every feature's routes rely on req.session existing, even though only
 * the users feature ever writes req.session.userId.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const config = require('./index');
const { SessionStore } = require('../features/users/sessionStore');

// Session secret: persisted to <dataDir>/.session-secret so sessions survive
// a server restart. Generated once on first run; override with SESSION_SECRET.
function getSessionSecret() {
  if (config.auth.sessionSecret) return config.auth.sessionSecret;
  const secretPath = path.join(config.dataDir, '.session-secret');
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim();
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, secret, 'utf8');
  return secret;
}

function createSessionMiddleware(db) {
  return session({
    store: new SessionStore(db),
    secret: getSessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: config.auth.sessionMaxAgeHours * 60 * 60 * 1000,
      sameSite: 'lax',
    },
  });
}

module.exports = { createSessionMiddleware };

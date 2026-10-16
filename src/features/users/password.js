/**
 * password.js
 * bcryptjs wrapper (pure JS — no native build step needed on top of SSPI).
 */
const bcrypt = require('bcryptjs');
const config = require('../../config');

async function hash(password) {
  return bcrypt.hash(password, config.auth.bcryptRounds);
}

async function verify(password, hashValue) {
  if (!hashValue) return false;
  return bcrypt.compare(password, hashValue);
}

/** Minimum bar from config.auth.passwordMinLength. Kept simple; not a policy engine. */
function isStrongEnough(password) {
  return typeof password === 'string' && password.length >= config.auth.passwordMinLength;
}

module.exports = { hash, verify, isStrongEnough };

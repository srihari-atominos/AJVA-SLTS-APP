/**
 * sso.js
 * Windows SSO (on-prem Active Directory via native SSPI — Kerberos/NTLM).
 * Wraps node-expose-sspi so the rest of this feature doesn't need to know
 * whether the native module loaded, or check SSO_ENABLED/SSO_ALLOWED_DOMAINS
 * directly — it just asks `active` and `domainAllowed(domain)`.
 */
const config = require('../../config');

let sspiSso = null;
try { sspiSso = require('node-expose-sspi').sso; } catch { /* unavailable on this host */ }

const active = !!sspiSso && config.sso.enabled; // module loaded AND not disabled via SSO_ENABLED=false

function domainAllowed(domain) {
  const allow = config.sso.allowedDomains;
  return allow.length === 0 || allow.includes(String(domain || '').toLowerCase());
}

/** Express middleware that performs the actual NTLM/Negotiate handshake. */
function authMiddleware() {
  return sspiSso.auth();
}

module.exports = { active, domainAllowed, authMiddleware };

/**
 * saml.js
 * Federated SSO via SAML 2.0, alongside password login and Windows SSPI
 * SSO — for users on non-domain devices, or to federate through an
 * existing enterprise IdP (ADFS/Entra/Okta/etc). Disabled unless
 * ENABLE_SAML=true and the entry point/issuer/callback/cert are all set.
 *
 * The actual XML signature verification, replay/expiry checks, and
 * audience validation are handled entirely by @node-saml/node-saml — this
 * module only wires config and extracts the fields this app needs
 * (email, display name) from whatever the IdP's assertion contains.
 */
const config = require('../../config');

let saml = null;
const { enabled, entryPoint, issuer, callbackUrl, cert } = config.saml;
const active = enabled && !!entryPoint && !!issuer && !!callbackUrl && !!cert;

if (active) {
  const { SAML } = require('@node-saml/node-saml');
  saml = new SAML({
    entryPoint,
    issuer,
    callbackUrl,
    idpCert: cert,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
  });
} else if (enabled) {
  console.warn('[saml] ENABLE_SAML=true but SAML_ENTRY_POINT/SAML_ISSUER/SAML_CALLBACK_URL/SAML_CERT are not all set — SAML stays disabled.');
}

/** Redirect URL to start a login at the IdP. */
async function getLoginUrl() {
  return saml.getAuthorizeUrlAsync('', undefined, {});
}

/**
 * Verifies the IdP's POSTed assertion and returns a normalized
 * { email, name } — the exact claim names vary by IdP, so this checks the
 * handful of common ones. Adjust here if your IdP uses a different
 * attribute URI for email/display name.
 */
async function verifyAssertion(body) {
  const { profile } = await saml.validatePostResponseAsync(body);
  const email =
    profile.email ||
    profile.nameID ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'];
  const name =
    profile.displayName ||
    profile.name ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
    null;
  return { email, name };
}

module.exports = { active, getLoginUrl, verifyAssertion };

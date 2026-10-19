/**
 * config.js
 * Every tunable value in the app lives here, sourced from environment
 * variables (loaded from .env via dotenv) with a documented default.
 * Nothing else in the codebase should hardcode a port, timeout, limit,
 * path, or secret — it reads from this module instead.
 *
 * Copy .env.example to .env and override what you need; .env is never
 * required to exist (every value has a sane default for local dev).
 */
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..'); // the SLTS app folder (two levels up from src/config)
require('dotenv').config({ path: path.join(ROOT_DIR, '.env') });

const num = (v, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const bool = (v, def) => (v === undefined ? def : v === 'true' || v === '1');

const APP_NAME = process.env.APP_NAME || 'SLTS';

module.exports = {
  APP_NAME,
  env: process.env.NODE_ENV || 'development',

  server: {
    // SERVER_PORT takes precedence to match the naming your other
    // production apps use; PORT is kept as the simple local-dev default.
    port: num(process.env.SERVER_PORT, num(process.env.PORT, 4000)),
  },

  // Public URL this app is reachable at — used for building absolute links
  // (e.g. a SAML callback URL) when a relative one isn't appropriate.
  // BACKEND_URL / HOST are accepted as synonyms, same as your other app.
  backendUrl: process.env.BACKEND_URL || process.env.HOST || null,

  db: {
    // 'sqlite' (default, local file, zero extra server) or 'mssql'
    // (production, on-prem SQL Server). Auto-detected: setting DB_HOST
    // switches to mssql without needing a separate flag, but DB_DRIVER
    // can force either explicitly.
    driver: process.env.DB_DRIVER || (process.env.DB_HOST ? 'mssql' : 'sqlite'),
    // At every server start, create any missing warranty data tables (never
    // drops/alters existing ones) so a brand-new database is ready for XML
    // uploads through the app. See features/vehicles/dataSchema.js.
    autoSchema: bool(process.env.DB_AUTO_SCHEMA, true),
    mssql: {
      host: process.env.DB_HOST || 'localhost',
      port: num(process.env.DB_PORT, 1433),
      user: process.env.DB_USER || 'sa',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'warranty',
      encrypt: bool(process.env.SQL_ENCRYPT, false),
      trustServerCertificate: bool(process.env.TRUST_CERTIFICATE, true),
    },
  },

  // Where the SQLite file and generated session-secret file live.
  // Override DATA_DIR to point the whole app at a different data folder.
  dataDir: process.env.DATA_DIR || path.join(ROOT_DIR, 'data'),

  // Static frontend files (public/). Not env-overridable — there's only
  // ever one correct location relative to this app, unlike data storage.
  publicDir: path.join(ROOT_DIR, 'public'),

  // Where src/scripts/convert.js looks for the *_XML source folders.
  // Defaults to the parent of this app folder (its normal home next to the XML exports).
  xmlSourceDir: process.env.XML_SOURCE_DIR || path.join(ROOT_DIR, '..'),

  auth: {
    sessionMaxAgeHours: num(process.env.SESSION_MAX_AGE_HOURS, 12),
    bcryptRounds: num(process.env.BCRYPT_ROUNDS, 12),
    passwordMinLength: num(process.env.PASSWORD_MIN_LENGTH, 8),
    // Set SESSION_SECRET explicitly in production (e.g. multiple server
    // instances sharing one DB). Left unset, one is generated once and
    // persisted to <dataDir>/.session-secret on first run.
    sessionSecret: process.env.SESSION_SECRET || null,
  },

  // Seeds (or confirms) a Super Admin from .env on every server start — an
  // alternative to running `npm run create-super-admin` by hand. Only acts
  // when both SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are set; see
  // src/features/users/superAdmin.js for exactly what it does and when
  // it's a no-op.
  superAdmin: {
    email: process.env.SUPER_ADMIN_EMAIL || null,
    name: process.env.SUPER_ADMIN_NAME || null,
    password: process.env.SUPER_ADMIN_PASSWORD || null,
    // false (default, recommended): exactly one Super Admin account ever
    // exists. true: each distinct SUPER_ADMIN_EMAIL gets its own Super
    // Admin account instead of there being a single one — a real change to
    // the security model, not just a config tweak; see the README.
    allowMultiple: bool(process.env.SUPER_ADMIN_ALLOW_MULTIPLE, false),
  },

  // Windows SSO (on-prem Active Directory via native SSPI). The handshake
  // itself needs no credentials here — it runs as the OS identity of
  // whoever is signed into Windows. These only narrow/disable it.
  sso: {
    enabled: bool(process.env.SSO_ENABLED, true),
    // Comma-separated Windows domain names allowed to sign in via SSO, e.g.
    // "CORP,CONTOSO". Empty (default) = accept any domain the handshake reports.
    allowedDomains: (process.env.SSO_ALLOWED_DOMAINS || '')
      .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
  },

  // SAML SSO (federated, for non-domain devices or an existing enterprise
  // IdP) — optional, alongside password login and Windows SSPI SSO.
  saml: {
    enabled: bool(process.env.ENABLE_SAML, false),
    entryPoint: process.env.SAML_ENTRY_POINT || null,
    issuer: process.env.SAML_ISSUER || null,
    callbackUrl: process.env.SAML_CALLBACK_URL || null,
    cert: process.env.SAML_CERT || null,
  },

  upload: {
    maxFileSizeMb: num(process.env.UPLOAD_MAX_FILE_MB, 50),
    maxFiles: num(process.env.UPLOAD_MAX_FILES, 20),
  },

  laborTime: {
    // Sanity bound for a labor-time edit (hours). Rejects obvious typos
    // (e.g. a stray extra digit) without hardcoding it inline at the call site.
    maxHours: num(process.env.MAX_LABOR_HOURS, 999),
    // How long an entry keeps its NEW / MODIFIED ribbon (and stays in the
    // "new items" / "time modified" filters) after the upload or edit that
    // changed it. Uploads happen file by file over days, so the window is
    // time-based rather than "since the last upload".
    changeHighlightDays: num(process.env.CHANGE_HIGHLIGHT_DAYS, 7),
  },

  // Only used by the optional `npm run import:mongo` path.
  mongo: {
    url: process.env.MONGO_URL || 'mongodb://127.0.0.1:27017',
    dbName: process.env.MONGO_DB_NAME || 'warranty',
    batchSize: num(process.env.MONGO_BATCH_SIZE, 2000),
  },

  mail: {
    // mode is derived, not set directly: 'smtp' once SMTP_HOST is present, else 'dev'.
    host: process.env.SMTP_HOST || null,
    port: num(process.env.SMTP_PORT, 587),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || null,
    pass: process.env.SMTP_PASS || null,
    from: process.env.SMTP_FROM || `${APP_NAME} <no-reply@local>`,
  },
};

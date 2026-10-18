# SLTS — Service Labor Time Standards (GSLTS XML → Data Tables → MERN viewer)

The XML files in the folders next to this app are **Ford/Lincoln GSLTS publication extracts**
(Global Service Labor Time Standards) — the standard labor times used to pay warranty claims.
Each file = one vehicle line / model year / market (e.g. `IMCHN2021CEN_Aviator_-_TU_-_U611.xml`
= Import China, 2021, English, Lincoln Aviator), containing the vehicle definition
(engines, transmissions, features) and hundreds of labor operations with assessed repair times.

## Pipeline

```
*.xml (126 files, ~210 MB)
   │  npm run convert      (fast-xml-parser, streamed NDJSON output)
   ▼
data/vehicles.ndjson   (126 rows — one per extract)
data/laborops.ndjson   (111,531 rows — one per full labor op time entry)
   │  npm run import       (SQLite, Node built-in driver)
   ▼
data/warranty.db  (~31 MB single file: vehicles, engines, transmissions, features, laborops)
   │  npm start
   ▼
http://localhost:4000   (Express API + React UI)
```

## Commands

```bash
npm install          # once
npm run convert      # re-run when XML files change
npm run import       # rebuilds data/warranty.db (SQLite)
npm run import:mongo # optional: load into local MongoDB instead
npm start            # serves the app on http://localhost:4000 (node src/server.js)
```

## Architecture

Feature-based backend under `src/`, each feature laid out `router → controller → service →
repository` (the controller/service split is skipped only where a route is a trivial passthrough,
e.g. `GET /auth/public-config`):

```
src/
  server.js              entry point: DB connection, Super Admin env-seed, app.listen
  app.js                 Express app assembly — middleware, every feature's router, static pages
  config/
    index.js             every env-driven setting (see Configuration below)
    db.js                  picks SQLite or MSSQL (config.db.driver), wraps it in dbContext, bootstraps schema
    dbContext.js             the uniform all/get/run/insert/transaction interface both drivers implement
    session.js                express-session middleware, backed by the sessions table (either driver)
  middlewares/
    rbac.js               requireAuth / requireRole — used by every feature, so it's global
    errorHandler.js         single catch-all error → JSON response
  features/
    users/                 signup, login, Windows SSO + SAML + account linking, user management
      sso.js                  Windows SSPI wrapper (on-prem AD)
      saml.js                  federated SSO wrapper (@node-saml/node-saml)
      schema.js / schema.mssql.js   users/sessions DDL, one file per driver (DDL syntax genuinely differs)
    vehicles/               vehicle list, XML upload/upsert, delete
    laborops/                labor-time list/filter/export/lookup, the totTime-only edit
    stats/                    header summary — calls vehicles' and laborops' services, not their repositories
  scripts/                CLI tools: convert.js, import-sqlite.js, import-mssql.js, import-mongo.js, export-csv.js, createSuperAdmin.js
```

A feature never reaches into another feature's repository directly — cross-feature calls go
through the other feature's exported service (see `vehicles.service.js`'s comment on the one
documented exception: an uploaded extract's vehicle row and its labor-time rows are inserted in
one transaction, so vehicles' service calls `laborOpsService.insertMany(...)` from inside the
transaction it started, rather than splitting an atomic write across two separate transactions).

The frontend (`public/`) is intentionally **not** a build-tooled SPA — static HTML pages with
React loaded from a CDN, no Redux/Router/bundler. See `.windsurf/rules/project-rules.md` for the
full reasoning (adapted from the team's general architecture rules to this project's actual scale).

## SQL schema (data/warranty.db)

- `vehicles(id, vehKey, fileName, source, gsa, modYear, vehCode, vehDesc, brandCode, …)`
- `engines / transmissions / features (vehicleId → vehicles.id, …)`
- `laborops(id, vehKey, laborDescCode, fullLaborOpCode, operationDesc, totTime, categoryCode, qualDesc, secNo, secDesc, effectiveDate, status, …)`
- Indexes on `vehKey`, `laborDescCode`, `fullLaborOpCode`

Query it directly from any SQLite tool, e.g.
`SELECT operationDesc, totTime FROM laborops WHERE fullLaborOpCode = '1102BB' AND vehKey = 'NA-USA-2015-1F';`

## API

- `GET /health` — public, no auth; checks the DB connection is actually usable (backs the Docker `HEALTHCHECK` — see **Deploying with Docker**)
- `GET /api/stats` — row counts, years, markets
- `GET /api/vehicles` — all vehicle extracts
- `GET /api/laborops?vehKey=IM-CHN-2021-TU&modYear=2021&gsa=CHN&q=brake&exact=true&page=1&limit=50` — filtered, paginated rows
- `GET /api/laborops/export?...` — same filters as above, streams a full (unpaginated) CSV download
- `GET /api/lookup?code=1102BB&vehKey=NA-USA-2015-1F` — exact op-code lookup for claim validation
- `POST /api/upload` — multipart form, field `files` (one or more `.xml`, same GSLTS format as the source folders). Each file is flattened with `src/features/vehicles/flatten.js` (the same logic `src/scripts/convert.js` uses) and **upserted**: a vehicle with a matching `vehKey` (source-market-year-vehicleCode) is fully replaced with the uploaded version; a new `vehKey` is added. Returns a per-file result (`added`/`updated`/error) — also available from the "Add / update vehicle data" panel in the UI.
- `DELETE /api/vehicles/:vehKey` — removes a vehicle and all its labor-time rows (e.g. to undo a bad upload)

## Data table columns (laborops)

| Field | Meaning |
|---|---|
| vehKey | source-market-year-vehicleCode (e.g. `IM-CHN-2021-TU`) |
| laborDescCode / fullLaborOpCode | base labor op / claimable op code |
| operationDesc | repair description |
| totTime | assessed labor time in hours |
| categoryCode / catDesc / qualDesc | time category and qualifier (drive type, engine, etc.) |
| secNo / secDesc | service manual section |
| tsid / effectiveDate / status | time study id, validity date, status (P = published) |

Requires Node 22.5+ (built-in SQLite driver). MongoDB is only needed for the optional `import:mongo` path.

## Regional extracts (EU): deriving year and market

The China (`IM`/`CHN`) and US (`NA`/`USA`) extracts are published per market and model year, so their header carries real values. The European extracts (`EUEN_*.xml`) are published once per vehicle line for the whole region and their header literally says `<GSA>ALL</GSA>` / `<MODYR>ALL</MODYR>` — the only place the year and production window appear is the free-text `<VEHDESC>`, e.g. `Fiesta 1989 (03/1989-09/1996)`, `Ka 2016.5 (04/2016-)`, `Windstar (10/1994-07/2000)`, `Mustang 2024`, `Bronco`.

`src/features/vehicles/vehicleMeta.js` (used by every upload and by `npm run convert`) treats `ALL` as "unknown, derive it":

| Field | Rule |
|---|---|
| `gsa` (market) | header value if real; else the source region (`EU`) |
| `modYear` | header value if real; else the first `19xx`/`20xx` (optionally `.25`/`.5`/`.75`) in the description before the window; else the window's start year (warning); else `NULL` (warning) |
| `prodStart` / `prodEnd` | `YYYY-MM` from the parenthesised `MM/YYYY-MM/YYYY` or `MM/YYYY-` range (`.` separators and missing space tolerated); `NULL` if absent |

The `vehKey` keeps using the **raw** header (`EU-ALL-ALL-03`): it only has to be unique and stable, and changing it would turn a re-upload into a duplicate instead of a replacement. Every fallback is reported as a warning in the upload response (`results[].warnings`) and the server log, so a new extract format is noticed at upload time. `npm test` covers every description shape seen so far — add a case there when Ford invents a new one.

**Rows loaded before this existed** still carry `ALL`. Two equivalent ways to repair them in place (both leave `vehKey` untouched and update `laborops` too, which is what the filters query):

```bash
npm run backfill:vehicle-meta            # dry run: prints the exact UPDATE statements, changes nothing
npm run backfill:vehicle-meta -- --apply # applies them in one transaction
```
or review and run `sql/backfill-eu-vehicle-meta.sql` (generated from the EUEN folder with the same function) in SSMS. The `prodStart`/`prodEnd` columns are added automatically the first time the new build starts (`ALTER TABLE ... ADD`, only if missing) — the SQL file includes the same guarded `ALTER` in case it runs first.

## Access control

Three roles, enforced server-side on every route (not just hidden in the UI):

| Role | Can do |
|---|---|
| **Super Admin** (exactly one) | Everything, including promoting/demoting/disabling Admins |
| **Admin** | Upload/import XML, edit labor times, disable/re-enable **Viewer**-level accounts only |
| **User (Viewer)** | Browse, filter, search, export CSV — no upload, no edit, no user management |

An Admin has no path to create another Admin or change any existing Admin's role or status — `PATCH /api/users/:id/role` is Super-Admin-only, and `PATCH /api/users/:id/status` rejects an Admin's request if the target isn't currently a Viewer. This is enforced in `src/features/users/users.service.js`, independent of what the UI shows.

### First-time setup

Two ways to get the first Super Admin in — same underlying logic (`src/features/users/superAdmin.js`), either works:

```bash
# A: run once, by hand
npm run create-super-admin -- --email=you@company.com --name="Your Name" --password=yourpassword
```

```bash
# B: set in .env, applied automatically every time the server starts
SUPER_ADMIN_EMAIL=you@company.com
SUPER_ADMIN_NAME=Your Name
SUPER_ADMIN_PASSWORD=yourpassword
```

Both are deliberately **not** reachable over HTTP — there's no API endpoint that creates or reassigns a Super Admin. Re-running either always updates the *same* account by default (also how you reset a forgotten password): if a Super Admin with a *different* email already exists, option B refuses to touch it automatically (logs why and tells you to use option A instead) rather than letting a stale `.env` silently take over someone's real account on a restart.

**Multiple Super Admins?** The default is exactly one, and that's the recommendation — it's the single clearest security boundary in this app: one identity with unconditional control, easy to reason about and to revoke. If you have a real need for more than one (e.g. redundancy across two people), set `SUPER_ADMIN_ALLOW_MULTIPLE=true`; then each distinct email becomes its own full Super Admin rather than there being one shared account. That's a real change to the security model — anyone with that role can do *anything*, including changing other Admins' roles — not just a convenience setting, so treat it deliberately.

### Signing in

Three methods can be active at once:

1. **Windows SSO** (on-prem Active Directory, via native SSPI — Kerberos/NTLM, `node-expose-sspi`) — automatic for domain-joined PCs on the corporate network. A user links their own Windows identity once (the "Link your Windows account" prompt shown after signing in with a password) — self-service, not an admin typing `domain\username` into a box. Until linked, that user falls through to the password form. Turn it off entirely with `SSO_ENABLED=false`, or restrict it to specific AD domains with `SSO_ALLOWED_DOMAINS=CORP,CONTOSO` (empty = any domain accepted). The handshake itself needs no credentials in `.env` — it runs as whoever is signed into Windows on that machine. **Only works when this process runs directly on Windows** (e.g. as a Windows Service) — SSPI is a native Windows API, so it's inert inside a Linux container (the default Docker image here is `node:22-slim`, Debian-based). Dockerized deployments should rely on SAML instead.
2. **SAML SSO** (`ENABLE_SAML=true` + `SAML_ENTRY_POINT`/`SAML_ISSUER`/`SAML_CALLBACK_URL`/`SAML_CERT`) — federated login through an existing enterprise IdP (ADFS/Entra/Okta/etc.), or for devices that aren't domain-joined. Works from anywhere, including a Linux container, since it's just signed HTTPS/XML — no native OS API involved. The IdP's assertion is trusted proof of identity, so a never-seen-before email **auto-provisions an active Viewer account** on first SAML login, rather than requiring a pre-existing account (same "lands as Viewer, Admin promotes later" model as self-signup). `@node-saml/node-saml` handles all signature/expiry/audience verification before `src/features/users/users.service.js` ever sees the result. **Verified against a real signed assertion**, not just written and assumed correct: a self-signed test IdP (cert/key via OpenSSL, a mock IdP server via the `saml-idp` package) generated an actual signed SAML Response, which `/auth/saml/callback` correctly verified, auto-provisioned a Viewer account from, and started a session for. A second test — the same assertion with its email claim tampered with after signing — was correctly **rejected** (redirected to `login.html?saml=failed`, no account created), confirming signature verification is doing real work, not silently passing everything through. Your actual IdP will need its own `SAML_ENTRY_POINT`/`SAML_ISSUER`/`SAML_CERT` values, which this test couldn't substitute for, but the verification code path itself is now proven, not just plausible.
3. **Email + password** — the fallback path, and how every self-signed-up account signs in until it links Windows or federates via SAML. A proper login page + session cookie, not the browser's native Basic-Auth popup (no real logout, poor UX).

Any of the three lands on the same server-side session (`express-session`, stored in the `sessions` table via `src/features/users/sessionStore.js`).

### Getting new users in — self-signup, no invite step

Anyone can create their own account at `/signup.html` (email, optional name, password). It's created **immediately, active, as a Viewer** — no invite email, no token, no admin action needed first. From there:

- **Super Admin** promotes a Viewer to Admin (or back) from **Manage Users** (`/users.html`) whenever they choose — `PATCH /api/users/:id/role`, Super-Admin-only, same guardrail as before.
- **Admin** can disable/re-enable a Viewer-level account (e.g. someone who shouldn't have signed up), but still has no path to touch Admin-level accounts.

There's no `src/features/users/mailer.js` call anywhere in this flow anymore — that module is still there, unused, kept around in case a future feature (e.g. password reset) needs to send email, but nothing currently invokes it.

### Security note

Sessions/passwords are only as safe as the transport they travel over. This app currently runs on plain HTTP (`localhost:4000`). That's fine for `localhost`-only use; once real logins are involved and it's reached over the network, put it behind HTTPS (reverse proxy or a certificate on the Node server) before relying on it.

## Configuration

Nothing operationally significant is hardcoded in the source — every tunable value (ports, timeouts, limits, secrets, mail settings, data locations) lives in **`src/config/index.js`**, sourced from environment variables with a documented default. Copy `.env.example` to `.env` and override only what you need:

```bash
cp .env.example .env
```

| Variable | Default | Controls |
|---|---|---|
| `PORT` / `SERVER_PORT` | `4000` | HTTP port — `SERVER_PORT` wins if both are set |
| `NODE_ENV` | `development` | Standard Node environment flag |
| `APP_NAME` | `SLTS` | Shown in email subjects/body |
| `BACKEND_URL` / `HOST` | unset | This app's public URL, e.g. for a SAML callback URL built from it |
| `DATA_DIR` | `./data` | Where `warranty.db` (SQLite mode), the session-secret file, and `outbox/` live |
| `XML_SOURCE_DIR` | `..` | Where `src/scripts/convert.js` looks for the `*_XML` source folders |
| `DB_DRIVER` / `DB_HOST` | unset → SQLite | Setting `DB_HOST` (or `DB_DRIVER=mssql`) switches every repository to MSSQL — see **Production: MSSQL Server** below |
| `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `1433` / `sa` / — / `warranty` | MSSQL connection, only used when the driver is `mssql` |
| `SQL_ENCRYPT` / `TRUST_CERTIFICATE` | `false` / `true` | MSSQL TLS options — the defaults suit an internal server with a self-signed/no cert |
| `SESSION_MAX_AGE_HOURS` | `12` | How long a login session lasts |
| `BCRYPT_ROUNDS` | `12` | Password hashing cost |
| `PASSWORD_MIN_LENGTH` | `8` | Minimum password length, enforced server-side and reflected in the UI |
| `SESSION_SECRET` | auto-generated, persisted to `<DATA_DIR>/.session-secret` | Session cookie signing key — set explicitly if you ever run more than one server instance |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_NAME` / `SUPER_ADMIN_PASSWORD` | unset → no auto-seed | Seed/confirm a Super Admin on every server start (see **First-time setup** above) |
| `SUPER_ADMIN_ALLOW_MULTIPLE` | `false` | `true` lets each distinct `SUPER_ADMIN_EMAIL` be its own Super Admin instead of there being one shared account |
| `SSO_ENABLED` | `true` | Set `false` to disable Windows SSO entirely, even if the native module loaded |
| `SSO_ALLOWED_DOMAINS` | unset → any domain | Comma-separated Windows domain names allowed to SSO in, e.g. `CORP,CONTOSO` |
| `ENABLE_SAML` / `SAML_ENTRY_POINT` / `SAML_ISSUER` / `SAML_CALLBACK_URL` / `SAML_CERT` | `false` / unset | Federated SSO — all four must be set alongside `ENABLE_SAML=true` or it stays inactive |
| `UPLOAD_MAX_FILE_MB` / `UPLOAD_MAX_FILES` | `50` / `20` | XML upload limits |
| `MAX_LABOR_HOURS` | `999` | Sanity bound on a labor-time edit, enforced server-side and in the edit popup |
| `MONGO_URL` / `MONGO_DB_NAME` / `MONGO_BATCH_SIZE` | local Mongo / `warranty` / `2000` | Only used by `npm run import:mongo` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | unset → dev mode | Not currently used (no invite email in this flow) — reserved for a future feature like password reset |
| `DOCKER_REGISTRY` | `warranty` | Image tag prefix for `docker-compose.yml` — not read by the app itself |

A few frontend pages fetch select values (password length, max labor hours) from `GET /auth/public-config` at load time rather than hardcoding them, so changing `.env` changes both the server-side validation and what the UI tells the user — they can't drift apart.

## Production: MSSQL Server

Every repository goes through a uniform query interface (`src/config/dbContext.js`) that works identically against SQLite or MSSQL — the SQL text each repository writes is the same `?`-placeholder style either way; only `src/config/db.js` (which driver to connect) and the pagination query in `laborops.repository.js` (SQLite's `LIMIT/OFFSET` vs MSSQL's `OFFSET/FETCH`) know which driver is active.

**Switching on:** set `DB_HOST` (plus `DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`) in `.env` — the driver auto-detects to `mssql` the moment `DB_HOST` is present; no separate flag needed (though `DB_DRIVER=mssql` works too, if you want it explicit). The target database (`DB_NAME`, default `warranty`) must already exist on the server — this app creates *tables*, never the database itself.

**Setup — point `.env` at the instance and start:**
```bash
# 1. Point .env at your MSSQL instance (DB_HOST etc.) and set SUPER_ADMIN_EMAIL/NAME/PASSWORD
# 2. Start the app — it connects to MSSQL automatically because DB_HOST is set:
npm start
```
Everything else happens automatically at startup, in this order (`src/server.js`):

1. **`users`/`sessions` tables** are created if missing (`src/features/users/schema.mssql.js`).
2. **Warranty data tables** (`vehicles`/`engines`/`transmissions`/`features`/`laborops` + indexes) are created if missing, empty (`src/features/vehicles/dataSchema.js`). Existing tables are never dropped or altered.
3. **Super Admin** is seeded from `SUPER_ADMIN_*` in `.env` (see **First-time setup** above).

**No data is loaded at startup** — the app and its Docker image ship without the XML extracts or any converted copy of them, which keeps the image small. Load the data through the running app instead: sign in as Admin/Super Admin and upload the GSLTS XML files (`POST /api/upload`, up to `UPLOAD_MAX_FILES` per request, `UPLOAD_MAX_FILE_MB` each). Each file becomes one vehicle plus its labor ops; re-uploading a file replaces that vehicle's rows.

`DB_AUTO_SCHEMA=false` opts out of step 2. The target *database* must exist beforehand, and the login needs CREATE TABLE/INDEX on it for the first start.

`npm run import:mssql` remains as a **bulk rebuild-from-scratch** path for an operator with the XML folders on hand: it DROPS and recreates the five warranty tables from `data/*.ndjson` (produced by `npm run convert`). Never point it at a database you don't intend to wipe.

**Verified against a real instance**, not just written and assumed correct: this was built and tested end-to-end against a live `mssql/server:2022` container — all 126 vehicles and 111,531 labor-time rows imported, then signup/login/session persistence/role changes/the upload transaction/pagination all exercised through the running app. One real bug surfaced and was fixed this way: SQL Server's `UNIQUE` constraint, unlike SQLite's, only allows a single `NULL` per column — `windowsUsername` (`NULL` until a user links their Windows account) needed a **filtered** unique index (`WHERE windowsUsername IS NOT NULL`) instead, or the second-ever user signup would fail outright. See the comment in `src/features/users/schema.mssql.js`.

**Not yet re-pointed at MSSQL:** `src/scripts/export-csv.js` stays SQLite-only (a local dev convenience, not part of the live app's request path) — extending it to MSSQL is a small, isolated follow-up if you need it.

## Deploying with Docker

`Dockerfile` builds the current combined app (API + static frontend, one Node process, one port) into a single Linux image — not the split frontend/backend-plus-Nginx topology some other apps use, since this app doesn't have a separate SPA build to serve. `docker-compose.yml` wires it up with the same environment variables as running it bare, following the naming convention from other production apps on this server (`DB_HOST`, `SERVER_PORT`, `DOCKER_REGISTRY`, etc.) wherever that overlaps with this app's own config.

```bash
cp .env.example .env    # fill in DB_HOST and the rest for your MSSQL instance
docker compose up -d --build
```

**Windows containers (Docker Engine on Windows Server, no Docker Desktop):** the default `Dockerfile` is a Linux image and will not run on an engine whose `docker info` shows `OSType: windows`. For that case use the Windows-container pair instead — `Dockerfile.windows` (Server Core build stage, Nano Server runtime, Node pinned by version + SHA256) and `docker-compose.windows.yml` (same env vars and port, volume at `C:\app\data`):

```bash
docker compose -f docker-compose.windows.yml up -d --build
```

Set `DB_HOST` to the host's LAN IP (not `localhost` — that is the container itself). The Windows image omits the native SSPI module, so Windows SSO is off there too; password and SAML login work as normal. On first start the container creates the (empty) warranty tables in the pre-existing database; load the data afterwards by uploading the XML extracts through the app — see **Production: MSSQL Server** above. Not yet built on a real Windows-container host — `docker compose -f docker-compose.windows.yml build` on the server is the first verification step.

**Windows SSO does not work inside this container.** The image (`node:22-slim`) is Linux-based, and SSPI is a native Windows API — `node-expose-sspi` is listed as an **optional** dependency precisely because of this (a plain `dependency` with an OS restriction makes `npm ci` fail the whole install on Linux; `optionalDependencies` lets npm skip it there instead). The app degrades gracefully (`ssoAvailable: false`, password/SAML login still work) rather than crashing. If SSO matters for the Dockerized deployment, **use SAML** (works from any OS — see **Signing in** above) rather than Windows SSPI. Windows SSPI SSO is really for running this process directly on Windows (as a Windows Service, not in a container) with domain-joined client PCs.

**Resilience, verified under real failure conditions** — not just written and assumed correct:
- Every route handler is wrapped in `asyncHandler` (`src/middlewares/asyncHandler.js`). Without it, Express 4 doesn't catch a rejected promise from an async handler — confirmed the hard way: a concurrent `/api/stats` request during a long-running MSSQL import hit a lock-wait timeout and **crashed the entire container**, not just that one request. With the wrapper in place, the same kind of failure (tested by stopping the MSSQL container mid-session) now returns a clean error response and the app keeps running.
- `GET /health` checks the DB connection is actually usable and backs the image's `HEALTHCHECK`. This matters because a fully lost DB connection doesn't self-heal on its own (also confirmed directly: stopping and restarting the MSSQL container left the app's connection pool permanently broken until the app process itself restarted) — `/health` is what lets Docker's own health status (and `docker run --restart`, or any real orchestrator) detect that and cycle the container for a fresh pool, rather than it quietly staying up but degraded indefinitely.

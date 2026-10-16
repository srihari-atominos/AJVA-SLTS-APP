/**
 * sessionStore.js
 * A minimal express-session Store backed by the 'sessions' table, via the
 * uniform dbContext — works identically against SQLite or MSSQL, since the
 * SQL here is plain `?`-placeholder CRUD with no dialect-specific syntax.
 * (No "upsert" keyword needed: SQLite's ON CONFLICT and MSSQL's MERGE are
 * different enough that doing a plain UPDATE-then-INSERT-if-no-rows-changed
 * is simpler and portable, and sessions don't need true atomic upsert —
 * one process owns writing a given session id at a time.)
 */
const session = require('express-session');
const config = require('../../config');

const DEFAULT_MAX_AGE_MS = config.auth.sessionMaxAgeHours * 60 * 60 * 1000;

class SessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
  }

  async get(sid, cb) {
    try {
      await this.db.run('DELETE FROM sessions WHERE expires < ?', [Date.now()]);
      const row = await this.db.get('SELECT data, expires FROM sessions WHERE sid = ?', [sid]);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) {
        await this.db.run('DELETE FROM sessions WHERE sid = ?', [sid]);
        return cb(null, null);
      }
      cb(null, JSON.parse(row.data));
    } catch (e) { cb(e); }
  }

  async set(sid, sessionData, cb) {
    try {
      const maxAge = sessionData.cookie && sessionData.cookie.maxAge ? sessionData.cookie.maxAge : DEFAULT_MAX_AGE_MS;
      const expires = Date.now() + maxAge;
      const data = JSON.stringify(sessionData);
      const r = await this.db.run('UPDATE sessions SET data = ?, expires = ? WHERE sid = ?', [data, expires, sid]);
      if (!r.changes) {
        await this.db.run('INSERT INTO sessions (sid, data, expires) VALUES (?, ?, ?)', [sid, data, expires]);
      }
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }

  async destroy(sid, cb) {
    try { await this.db.run('DELETE FROM sessions WHERE sid = ?', [sid]); cb && cb(null); }
    catch (e) { cb && cb(e); }
  }

  async touch(sid, sessionData, cb) {
    try {
      const maxAge = sessionData.cookie && sessionData.cookie.maxAge ? sessionData.cookie.maxAge : DEFAULT_MAX_AGE_MS;
      await this.db.run('UPDATE sessions SET expires = ? WHERE sid = ?', [Date.now() + maxAge, sid]);
      cb && cb(null);
    } catch (e) { cb && cb(e); }
  }
}

module.exports = { SessionStore };

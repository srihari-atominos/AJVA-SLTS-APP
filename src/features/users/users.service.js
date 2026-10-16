/**
 * users.service.js
 * Business logic for accounts: self-signup, password/SSO/SAML login
 * matching, Windows-account linking, and the admin user-management
 * guardrails. Route handlers (users.controller.js) call these; nothing
 * here touches Express req/res directly, so it's testable independent of
 * HTTP. Async throughout — the repository is a real network round-trip
 * under the MSSQL driver.
 *
 * Role-change guardrails (enforced HERE, not just in the UI):
 *   - changeRole never allows touching a SUPER_ADMIN row. Combined with the
 *     route restricting /api/users/:id/role to requireRole('SUPER_ADMIN'),
 *     an Admin has no path to promote itself or anyone to Admin, let alone
 *     Super Admin.
 *   - changeStatus refuses an Admin acting on anything but a USER-level
 *     target, and refuses anyone acting on themselves or a Super Admin.
 */
const { hash, verify, isStrongEnough } = require('./password');
const sso = require('./sso');
const config = require('../../config');

function toPublicUser(u) {
  if (!u) return null;
  return {
    id: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
    windowsUsername: u.windowsUsername, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
  };
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function makeUsersService(repo) {
  async function signup({ email, name, password }) {
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw httpError('A valid email is required', 400);
    }
    if (!isStrongEnough(password)) {
      throw httpError(`Password must be at least ${config.auth.passwordMinLength} characters`, 400);
    }
    const emailNorm = String(email).trim().toLowerCase();
    if (await repo.findByEmail(emailNorm)) {
      throw httpError('An account with that email already exists', 409);
    }

    const passwordHash = await hash(password);
    const id = await repo.insert(emailNorm, name || null, 'USER', passwordHash, 'active');
    const user = await repo.findById(id);
    await repo.touchLogin(user.id);
    return user;
  }

  async function loginWithPassword({ email, password }) {
    if (!email || !password) throw httpError('Email and password required', 400);
    const u = await repo.findByEmail(String(email).trim().toLowerCase());
    if (!u || u.status !== 'active' || !(await verify(password, u.passwordHash))) {
      throw httpError('Invalid email or password', 401);
    }
    await repo.touchLogin(u.id);
    return u;
  }

  /** @returns {{user}|{reason: 'unavailable'|'domain'|'unlinked'}} */
  async function matchWindowsIdentity(identity) {
    if (!identity || !identity.name) return { reason: 'unavailable' };
    if (!sso.domainAllowed(identity.domain)) return { reason: 'domain' };
    const windowsUsername = `${identity.domain || ''}\\${identity.name}`.toLowerCase();
    const u = await repo.findByWindowsUsername(windowsUsername);
    if (!u || u.status !== 'active') return { reason: 'unlinked' };
    await repo.touchLogin(u.id);
    return { user: u };
  }

  /** @returns {{ok: true}|{reason: 'failed'|'domain'|'taken'}} */
  async function linkWindowsIdentity(currentUserId, identity) {
    if (!identity || !identity.name) return { reason: 'failed' };
    if (!sso.domainAllowed(identity.domain)) return { reason: 'domain' };
    const windowsUsername = `${identity.domain || ''}\\${identity.name}`.toLowerCase();
    const taken = await repo.findByWindowsUsername(windowsUsername);
    if (taken && taken.id !== currentUserId) return { reason: 'taken' };
    await repo.updateWindowsUsername(currentUserId, windowsUsername);
    return { ok: true };
  }

  /**
   * SAML login: the IdP has already verified this email (a federated,
   * trusted assertion — stronger proof than a self-signup form). On first
   * SAML login for a never-seen-before email, auto-provision a Viewer
   * account instead of requiring a pre-existing/linked one, matching the
   * same "lands as Viewer, Admin promotes later" model as self-signup.
   * A disabled account still cannot sign in this way.
   */
  async function loginWithSaml({ email, name }) {
    if (!email) throw httpError('SAML assertion did not include an email', 400);
    const emailNorm = String(email).trim().toLowerCase();
    let u = await repo.findByEmail(emailNorm);
    if (!u) {
      const id = await repo.insert(emailNorm, name || null, 'USER', null, 'active');
      u = await repo.findById(id);
    }
    if (u.status !== 'active') throw httpError('This account is disabled', 403);
    await repo.touchLogin(u.id);
    return u;
  }

  function getById(id) {
    return repo.findById(id);
  }

  function listAll() {
    return repo.listAll();
  }

  async function changeRole(targetId, role) {
    const target = await repo.findById(targetId);
    if (!target) throw httpError('User not found', 404);
    if (target.role === 'SUPER_ADMIN') throw httpError('Cannot change the Super Admin role', 403);
    if (!['ADMIN', 'USER'].includes(role)) throw httpError('role must be ADMIN or USER', 400);

    await repo.updateRole(target.id, role);
    return repo.findById(target.id);
  }

  async function changeStatus(requestingUser, targetId, status) {
    const target = await repo.findById(targetId);
    if (!target) throw httpError('User not found', 404);
    if (target.role === 'SUPER_ADMIN') throw httpError('Cannot change the Super Admin status', 403);
    if (requestingUser.role === 'ADMIN' && target.role !== 'USER') {
      throw httpError('Admins can only manage viewer-level accounts', 403);
    }
    if (target.id === requestingUser.id) throw httpError('Cannot change your own status', 403);
    if (!['active', 'disabled'].includes(status)) throw httpError('status must be active or disabled', 400);

    await repo.updateStatus(target.id, status);
    return repo.findById(target.id);
  }

  return {
    signup, loginWithPassword, matchWindowsIdentity, linkWindowsIdentity, loginWithSaml,
    getById, listAll, changeRole, changeStatus,
  };
}

module.exports = { makeUsersService, toPublicUser };

/**
 * users.repository.js
 * All direct SQL for the users table, via the uniform dbContext (works
 * against SQLite or MSSQL — see src/config/dbContext.js). Nothing outside
 * this file (and the schema migrations) touches `users` with raw SQL — the
 * service layer calls these functions instead.
 */
function makeUsersRepository(db) {
  return {
    findByEmail: (email) => db.get('SELECT * FROM users WHERE email = ?', [email]),
    findById: (id) => db.get('SELECT * FROM users WHERE id = ?', [id]),
    findByWindowsUsername: (windowsUsername) => db.get('SELECT * FROM users WHERE windowsUsername = ?', [windowsUsername]),
    listAll: () => db.all('SELECT * FROM users ORDER BY role, email', []),
    touchLogin: (id) => db.run('UPDATE users SET lastLoginAt = ? WHERE id = ?', [new Date().toISOString(), id]),

    async insert(email, name, role, passwordHash, status) {
      const { id } = await db.insert(
        'INSERT INTO users (email, name, role, passwordHash, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        [email, name, role, passwordHash, status, new Date().toISOString()]
      );
      return id;
    },

    updateRole: (id, role) => db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]),
    updateStatus: (id, status) => db.run('UPDATE users SET status = ? WHERE id = ?', [status, id]),
    updateWindowsUsername: (id, windowsUsername) => db.run('UPDATE users SET windowsUsername = ? WHERE id = ?', [windowsUsername, id]),
  };
}

module.exports = { makeUsersRepository };

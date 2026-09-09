// Uses Node.js 22 built-in SQLite (node:sqlite) — no native compilation,
// works on any CPU architecture. Requires --experimental-sqlite flag.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

let db;

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

function initDb() {
  const dbPath = path.resolve(process.env.DB_PATH || './data/sanctum.db');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new DatabaseSync(dbPath);

  // node:sqlite uses exec() for PRAGMAs (no .pragma() method)
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA synchronous = NORMAL');

  createSchema(db);
  cleanExpiredSessions(db);

  const cleanupInterval = Number.parseInt(process.env.SESSION_CLEANUP_INTERVAL_HOURS || '24') * 3600 * 1000;
  setInterval(() => cleanExpiredSessions(db), cleanupInterval);

  console.log(`[DB] Connected: ${dbPath}`);
  return db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      master_password_hash TEXT NOT NULL,
      kdf_params TEXT NOT NULL,
      protected_symmetric_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login INTEGER,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      totp_secret TEXT,
      totp_secret_pending TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS vault_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('login', 'note', 'card', 'identity')),
      encrypted_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_vault_items_user ON vault_items(user_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      refresh_token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refresh_token_hash);

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      success INTEGER NOT NULL DEFAULT 1,
      details TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

function cleanExpiredSessions(db) {
  const now = Date.now();
  const result = db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
  if (result.changes > 0) {
    console.log(`[DB] Cleaned ${result.changes} expired sessions`);
  }
}

/**
 * Run a function inside a SQLite transaction.
 * node:sqlite has no built-in .transaction() helper, so we use BEGIN/COMMIT.
 */
function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = { initDb, getDb, withTransaction };

const express = require('express');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { getDb, withTransaction } = require('../config/database');
const { hashAuthKey, verifyAuthKey, generateRefreshToken, hashRefreshToken, generateId } = require('../utils/crypto');
const { authenticate, auditLog } = require('../middleware/auth');
const { authLimiter, registerLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const LOCKOUT_ATTEMPTS = Number.parseInt(process.env.LOCKOUT_ATTEMPTS || '5');
const LOCKOUT_DURATION = Number.parseInt(process.env.LOCKOUT_DURATION_MS || '900000');

// --- Validation schemas ---
const registerSchema = z.object({
  email: z.string().email().max(254).toLowerCase(),
  username: z.string().min(2).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  masterPasswordHash: z.string().length(64, 'Must be 32-byte hex from client KDF'),
  kdfParams: z.object({
    algorithm: z.literal('argon2id'),
    iterations: z.number().int().min(2).max(10),
    memory: z.number().int().min(32768),
    parallelism: z.number().int().min(1).max(8),
    salt: z.string().min(32),
  }),
  protectedSymmetricKey: z.string().min(64),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  masterPasswordHash: z.string().length(64),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// --- Helper functions ---
function generateAccessToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });
}

function generateRefreshTokenAndStore(db, userId, req) {
  const token = generateRefreshToken();
  const tokenHash = hashRefreshToken(token);
  const expiresAt = Date.now() + parseDuration(process.env.JWT_REFRESH_EXPIRES || '7d');
  const sessionId = generateId();

  db.prepare(`
    INSERT INTO sessions (id, user_id, refresh_token_hash, expires_at, created_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    userId,
    tokenHash,
    expiresAt,
    Date.now(),
    req.ip || null,
    req.headers['user-agent'] || null
  );

  return { token, sessionId, expiresAt };
}

function parseDuration(dur) {
  const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const match = dur.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 86400000;
  return Number.parseInt(match[1]) * units[match[2]];
}

// --- Routes ---

/**
 * POST /api/auth/prelogin
 * Returns KDF parameters for the given email without revealing if the user exists.
 * Used by client to derive keys before attempting login.
 */
router.post('/prelogin', authLimiter, async (req, res) => {
  const db = getDb();
  const parsed = z.object({ email: z.string().email().toLowerCase() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  // Always respond with something to prevent user enumeration
  const user = db.prepare('SELECT kdf_params, protected_symmetric_key FROM users WHERE email = ?').get(parsed.data.email);

  // Fake params for non-existent users (same timing)
  await new Promise(r => setTimeout(r, 100));

  if (!user) {
    // Return plausible-looking fake params
    return res.json({
      kdfParams: {
        algorithm: 'argon2id',
        iterations: 3,
        memory: 65536,
        parallelism: 4,
        salt: require('crypto').randomBytes(32).toString('hex'),
      },
      protectedSymmetricKey: require('crypto').randomBytes(60).toString('base64'),
    });
  }

  return res.json({
    kdfParams: JSON.parse(user.kdf_params),
    protectedSymmetricKey: user.protected_symmetric_key,
  });
});

/**
 * POST /api/auth/register
 * Create a new user account.
 * The server never receives the master password or vault key.
 */
router.post('/register', registerLimiter, async (req, res) => {
  const db = getDb();
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
  }

  const { email, username, masterPasswordHash, kdfParams, protectedSymmetricKey } = parsed.data;

  try {
    // Check email uniqueness
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      // Avoid user enumeration: same timing regardless
      await new Promise(r => setTimeout(r, 300));
      return res.status(409).json({ error: 'Email already registered', code: 'EMAIL_EXISTS' });
    }

    // Server-side bcrypt hash of the client-derived auth key
    const storedHash = await hashAuthKey(masterPasswordHash);

    const userId = generateId();
    const now = Date.now();

    // Atomic: user INSERT + mark setup as done (both roll back on failure)
    withTransaction(() => {
      db.prepare(`
        INSERT INTO users (id, email, username, master_password_hash, kdf_params, protected_symmetric_key, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        email,
        username,
        storedHash,
        JSON.stringify(kdfParams),
        protectedSymmetricKey,
        now,
        now
      );

      db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      ).run('setup_done', 'true');
    });

    // Read instance name so frontend can update SetupContext in one round-trip
    const nameRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('instance_name');

    auditLog(db, { userId, action: 'REGISTER', req, success: true });

    return res.status(201).json({
      message: 'Account created successfully',
      setupDone: true,
      instanceName: nameRow?.value || 'Sanctum',
    });
  } catch (err) {
    console.error('[Register]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate and return tokens + encrypted vault data.
 */
router.post('/login', authLimiter, async (req, res) => {
  const db = getDb();
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const { email, masterPasswordHash } = parsed.data;

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    // Generic error to prevent user enumeration
    if (!user) {
      await new Promise(r => setTimeout(r, 500));
      auditLog(db, { action: 'LOGIN_FAILED', req, success: false, details: { reason: 'user_not_found', email } });
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    // Check account lockout
    if (user.locked_until && user.locked_until > Date.now()) {
      const unlockIn = Math.ceil((user.locked_until - Date.now()) / 60000);
      auditLog(db, { userId: user.id, action: 'LOGIN_BLOCKED', req, success: false, details: { reason: 'locked' } });
      return res.status(423).json({
        error: `Account locked. Try again in ${unlockIn} minute(s).`,
        code: 'ACCOUNT_LOCKED',
      });
    }

    // Verify the auth key (bcrypt compare is already timing-safe)
    const valid = await verifyAuthKey(masterPasswordHash, user.master_password_hash);

    if (!valid) {
      const newAttempts = user.failed_attempts + 1;
      const shouldLock = newAttempts >= LOCKOUT_ATTEMPTS;
      db.prepare(
        'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?'
      ).run(
        shouldLock ? 0 : newAttempts,
        shouldLock ? Date.now() + LOCKOUT_DURATION : null,
        user.id
      );

      auditLog(db, { userId: user.id, action: 'LOGIN_FAILED', req, success: false, details: { reason: 'wrong_password', attempts: newAttempts } });

      if (shouldLock) {
        return res.status(423).json({ error: 'Account temporarily locked due to multiple failed attempts.', code: 'ACCOUNT_LOCKED' });
      }
      return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
    }

    // Reset failed attempts on success
    db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ? WHERE id = ?')
      .run(Date.now(), user.id);

    // If TOTP is enabled, return a short-lived temp token instead of full auth
    if (user.totp_enabled) {
      const tempToken = jwt.sign(
        { sub: user.id, purpose: 'totp' },
        process.env.JWT_ACCESS_SECRET,
        { algorithm: 'HS256', expiresIn: '2m' }
      );
      auditLog(db, { userId: user.id, action: 'LOGIN_TOTP_REQUIRED', req, success: true });
      return res.json({ requiresTOTP: true, tempToken });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const { token: refreshToken } = generateRefreshTokenAndStore(db, user.id, req);

    // Fetch encrypted vault items
    const vaultItems = db.prepare(
      'SELECT id, type, encrypted_data, created_at, updated_at FROM vault_items WHERE user_id = ?'
    ).all(user.id);

    auditLog(db, { userId: user.id, action: 'LOGIN', req, success: true });

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      kdfParams: JSON.parse(user.kdf_params),
      protectedSymmetricKey: user.protected_symmetric_key,
      vault: vaultItems,
    });
  } catch (err) {
    console.error('[Login]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/refresh
 * Rotate refresh token and return a new access token.
 * Implements refresh token rotation — old token is immediately invalidated.
 */
router.post('/refresh', async (req, res) => {
  const db = getDb();
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid input' });
  }

  const { refreshToken } = parsed.data;
  const tokenHash = hashRefreshToken(refreshToken);

  try {
    const session = db.prepare(
      'SELECT * FROM sessions WHERE refresh_token_hash = ? AND expires_at > ?'
    ).get(tokenHash, Date.now());

    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired refresh token', code: 'INVALID_REFRESH_TOKEN' });
    }

    // Rotate: delete old session, create new one
    db.prepare('DELETE FROM sessions WHERE id = ?').run(session.id);

    const accessToken = generateAccessToken(session.user_id);
    const { token: newRefreshToken } = generateRefreshTokenAndStore(db, session.user_id, req);

    return res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('[Refresh]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/logout
 * Invalidate the current refresh token.
 */
router.post('/logout', authenticate, async (req, res) => {
  const db = getDb();
  const parsed = refreshSchema.safeParse(req.body);

  if (parsed.success) {
    const tokenHash = hashRefreshToken(parsed.data.refreshToken);
    db.prepare('DELETE FROM sessions WHERE refresh_token_hash = ? AND user_id = ?')
      .run(tokenHash, req.user.id);
  }

  auditLog(db, { userId: req.user.id, action: 'LOGOUT', req, success: true });
  return res.json({ message: 'Logged out successfully' });
});

/**
 * POST /api/auth/logout-all
 * Invalidate ALL sessions for the user (logout from all devices).
 */
router.post('/logout-all', authenticate, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(req.user.id);
  auditLog(db, { userId: req.user.id, action: 'LOGOUT_ALL', req, success: true });
  return res.json({ message: 'All sessions terminated' });
});

/**
 * GET /api/auth/me
 * Return current user info.
 */
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare(
    'SELECT id, email, username, created_at, last_login FROM users WHERE id = ?'
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'User not found' });

  const sessionCount = db.prepare(
    'SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND expires_at > ?'
  ).get(req.user.id, Date.now());

  return res.json({ ...user, activeSessions: sessionCount.count });
});

module.exports = router;
module.exports.generateAccessToken = generateAccessToken;
module.exports.generateRefreshTokenAndStore = generateRefreshTokenAndStore;

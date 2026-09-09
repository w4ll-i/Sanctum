const express = require('express');
const { z } = require('zod');
const { TOTP, Secret } = require('otpauth');
const { getDb } = require('../config/database');
const { authenticate, auditLog } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const jwt = require('jsonwebtoken');

const router = express.Router();

const TOTP_ISSUER = 'Sanctum';
const TOTP_WINDOW = 1; // Accept ±1 time step (~30s tolerance)

// ─── Helper ─────────────────────────────────────────────────────────────────

function createTOTP(secretBase32, email) {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

// ─── Setup: generate secret ──────────────────────────────────────────────────

/**
 * POST /api/totp/setup
 * Generate a TOTP secret and return the otpauth URL for QR code rendering.
 * The secret is stored temporarily (not yet active) until confirmed.
 */
router.post('/setup', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT email, totp_enabled FROM users WHERE id = ?').get(req.user.id);

  if (user?.totp_enabled) {
    return res.status(409).json({ error: '2FA is already enabled', code: 'TOTP_ALREADY_ENABLED' });
  }

  // Generate a fresh secret
  const secret = new Secret({ size: 20 });
  const secretBase32 = secret.base32;

  const totp = createTOTP(secretBase32, user.email);
  const otpauthUrl = totp.toString();

  // Store as pending (not yet enabled)
  db.prepare('UPDATE users SET totp_secret_pending = ? WHERE id = ?')
    .run(secretBase32, req.user.id);

  return res.json({ otpauthUrl, secretBase32 });
});

/**
 * POST /api/totp/confirm
 * Verify the first TOTP code and activate 2FA.
 */
router.post('/confirm', authenticate, authLimiter, (req, res) => {
  const db = getDb();
  const parsed = z.object({ code: z.string().length(6).regex(/^\d{6}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid TOTP code format' });

  const user = db.prepare('SELECT email, totp_secret_pending, totp_enabled FROM users WHERE id = ?').get(req.user.id);

  if (user?.totp_enabled) return res.status(409).json({ error: '2FA already active' });
  if (!user?.totp_secret_pending) return res.status(400).json({ error: 'No pending setup. Call /setup first.' });

  const totp = createTOTP(user.totp_secret_pending, user.email);
  const delta = totp.validate({ token: parsed.data.code, window: TOTP_WINDOW });

  if (delta === null) {
    auditLog(db, { userId: req.user.id, action: 'TOTP_CONFIRM_FAILED', req, success: false });
    return res.status(401).json({ error: 'Invalid code', code: 'TOTP_INVALID' });
  }

  db.prepare('UPDATE users SET totp_secret = totp_secret_pending, totp_secret_pending = NULL, totp_enabled = 1 WHERE id = ?')
    .run(req.user.id);

  auditLog(db, { userId: req.user.id, action: 'TOTP_ENABLED', req });
  return res.json({ message: '2FA enabled successfully' });
});

/**
 * DELETE /api/totp
 * Disable 2FA (requires current TOTP code).
 */
router.delete('/', authenticate, authLimiter, (req, res) => {
  const db = getDb();
  const parsed = z.object({ code: z.string().length(6).regex(/^\d{6}$/) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid TOTP code format' });

  const user = db.prepare('SELECT email, totp_secret, totp_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user?.totp_enabled) return res.status(400).json({ error: '2FA is not enabled' });

  const totp = createTOTP(user.totp_secret, user.email);
  const delta = totp.validate({ token: parsed.data.code, window: TOTP_WINDOW });

  if (delta === null) {
    auditLog(db, { userId: req.user.id, action: 'TOTP_DISABLE_FAILED', req, success: false });
    return res.status(401).json({ error: 'Invalid code', code: 'TOTP_INVALID' });
  }

  db.prepare('UPDATE users SET totp_secret = NULL, totp_secret_pending = NULL, totp_enabled = 0 WHERE id = ?')
    .run(req.user.id);

  auditLog(db, { userId: req.user.id, action: 'TOTP_DISABLED', req });
  return res.json({ message: '2FA disabled' });
});

/**
 * POST /api/totp/verify
 * Second step of login when TOTP is enabled.
 * Accepts the temp token issued during /api/auth/login and a TOTP code.
 * Returns full auth tokens on success.
 */
router.post('/verify', authLimiter, (req, res) => {
  const db = getDb();
  const parsed = z.object({
    tempToken: z.string().min(1),
    code: z.string().length(6).regex(/^\d{6}$/),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  // Verify the temp token
  let payload;
  try {
    payload = jwt.verify(parsed.data.tempToken, process.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (payload.purpose !== 'totp') throw new Error('Wrong purpose');
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TEMP_TOKEN' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user?.totp_enabled) return res.status(400).json({ error: 'TOTP not enabled for this user' });

  const totp = createTOTP(user.totp_secret, user.email);
  const delta = totp.validate({ token: parsed.data.code, window: TOTP_WINDOW });

  if (delta === null) {
    const newAttempts = (user.failed_attempts || 0) + 1;
    const shouldLock = newAttempts >= Number.parseInt(process.env.LOCKOUT_ATTEMPTS || '5');
    db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(
      shouldLock ? 0 : newAttempts,
      shouldLock ? Date.now() + Number.parseInt(process.env.LOCKOUT_DURATION_MS || '900000') : null,
      user.id
    );
    auditLog(db, { userId: user.id, action: 'TOTP_VERIFY_FAILED', req, success: false });
    return res.status(401).json({ error: 'Invalid TOTP code', code: 'TOTP_INVALID' });
  }

  // Success — issue full tokens
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

  const { generateAccessToken, generateRefreshTokenAndStore } = require('./auth');
  const accessToken = generateAccessToken(user.id);
  const { token: refreshToken } = generateRefreshTokenAndStore(db, user.id, req);

  const vaultItems = db.prepare(
    'SELECT id, type, encrypted_data, created_at, updated_at FROM vault_items WHERE user_id = ?'
  ).all(user.id);

  auditLog(db, { userId: user.id, action: 'TOTP_VERIFY_SUCCESS', req });

  return res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, username: user.username },
    kdfParams: JSON.parse(user.kdf_params),
    protectedSymmetricKey: user.protected_symmetric_key,
    vault: vaultItems,
  });
});

module.exports = router;

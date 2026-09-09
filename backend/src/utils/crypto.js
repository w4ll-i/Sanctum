const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// rounds=14 → ~1s hash time, 4× harder to brute-force than rounds=12
const BCRYPT_ROUNDS = 14;

/**
 * Hash the auth key using bcrypt for server-side storage.
 * The auth_key is already derived client-side from the master password,
 * so this adds a second layer of protection on the server.
 */
async function hashAuthKey(authKeyHex) {
  return bcrypt.hash(authKeyHex, BCRYPT_ROUNDS);
}

/**
 * Verify an auth key against its stored bcrypt hash.
 * Uses bcrypt.compare which is timing-safe.
 */
async function verifyAuthKey(authKeyHex, storedHash) {
  return bcrypt.compare(authKeyHex, storedHash);
}

/**
 * Generate a cryptographically secure random token for refresh tokens.
 */
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * SHA-256 hash of a refresh token for secure storage.
 */
function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a secure random ID (UUID v4 equivalent).
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still do a comparison to avoid timing leak on length difference
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  hashAuthKey,
  verifyAuthKey,
  generateRefreshToken,
  hashRefreshToken,
  generateId,
  timingSafeEqual,
};

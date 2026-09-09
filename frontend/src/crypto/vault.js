/**
 * Sanctum Client-side Cryptography Module
 *
 * Security Architecture (Zero-Knowledge):
 * ----------------------------------------
 * 1. master_password + email → Argon2id → master_key (32 bytes, never leaves client)
 * 2. master_key → HKDF-SHA256("vault") → vault_key (encrypts the symmetric key)
 * 3. master_key → HKDF-SHA256("auth") → auth_key_bytes (64 bytes for auth)
 * 4. auth_key_bytes (hex, first 32 bytes) → sent to server for bcrypt verification
 * 5. Random symmetric_key → encrypted with vault_key → protected_symmetric_key (stored on server)
 * 6. Vault items encrypted with symmetric_key using AES-256-GCM
 *
 * The server NEVER sees: master_password, master_key, vault_key, symmetric_key, plaintext data
 */

import { argon2id } from 'hash-wasm';

const SALT_BYTES = 32;
const IV_BYTES = 12; // AES-GCM standard

// ─── Argon2id Parameters ──────────────────────────────────────────────────────
// OWASP recommended minimum: 19MiB, 2 iterations
// We use 64MiB for stronger protection against GPU attacks
export const DEFAULT_KDF_PARAMS = {
  algorithm: 'argon2id',
  iterations: 3,
  memory: 65536, // 64 MiB
  parallelism: 4,
};

// ─── Utility functions ────────────────────────────────────────────────────────

function uint8ArrayToHex(arr) {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex) {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    result[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return result;
}

function uint8ArrayToBase64(arr) {
  let binary = '';
  arr.forEach(byte => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function base64ToUint8Array(b64) {
  const binary = atob(b64);
  const result = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i);
  return result;
}

function concatUint8Arrays(...arrays) {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Generate a cryptographically secure random Uint8Array */
function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

// ─── Key Derivation ───────────────────────────────────────────────────────────

/**
 * Derive the master key from password + salt using Argon2id.
 * The salt is stored server-side in kdf_params.
 *
 * @param {string} password - Master password (UTF-8)
 * @param {Uint8Array} salt  - 32-byte random salt (from kdf_params)
 * @param {object} params   - KDF parameters
 * @returns {Uint8Array} 32-byte master key
 */
export async function deriveMasterKey(password, salt, params = DEFAULT_KDF_PARAMS) {
  const hashOutput = await argon2id({
    password,
    salt,
    iterations: params.iterations,
    memorySize: params.memory,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: 'binary',
  });
  return new Uint8Array(hashOutput.buffer);
}

/**
 * Derive sub-keys from master key using HKDF-SHA256.
 * Produces:
 *   - vault_key: CryptoKey for AES-GCM (wraps/unwraps the symmetric key)
 *   - auth_key_hex: first 32 bytes hex string sent to server for authentication
 */
export async function deriveSubKeys(masterKey) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    masterKey,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const enc = new TextEncoder();

  // Vault key — used to wrap/unwrap the symmetric key
  const vaultKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('sanctum-v1-vault-key'),
      info: enc.encode('vault'),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
  );

  // Auth bits — 64 bytes, we send first 32 as hex to server
  const authBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: enc.encode('sanctum-v1-auth-key'),
      info: enc.encode('auth'),
    },
    keyMaterial,
    512 // 64 bytes
  );

  const authKey = new Uint8Array(authBits);
  const authKeyHex = uint8ArrayToHex(authKey.slice(0, 32));

  return { vaultKey, authKeyHex };
}

// ─── Symmetric Key Management ─────────────────────────────────────────────────

/**
 * Generate a new random 256-bit symmetric key for vault encryption.
 */
export async function generateSymmetricKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/**
 * Encrypt (wrap) the symmetric key with the vault key.
 * Returns a base64 string to store on the server.
 */
export async function protectSymmetricKey(symmetricKey, vaultKey) {
  const iv = randomBytes(IV_BYTES);
  const exportedKey = await crypto.subtle.exportKey('raw', symmetricKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    exportedKey
  );
  const combined = concatUint8Arrays(iv, new Uint8Array(encrypted));
  return uint8ArrayToBase64(combined);
}

/**
 * Decrypt (unwrap) the protected symmetric key using the vault key.
 */
export async function unprotectSymmetricKey(protectedKeyB64, vaultKey) {
  const data = base64ToUint8Array(protectedKeyB64);
  const iv = data.slice(0, IV_BYTES);
  const ciphertext = data.slice(IV_BYTES);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    ciphertext
  );

  return crypto.subtle.importKey(
    'raw',
    decrypted,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// ─── Vault Item Encryption / Decryption ──────────────────────────────────────

/**
 * Encrypt a vault item using the symmetric key.
 * Generates a fresh random IV for each encryption.
 *
 * @param {object} plainItem - Raw vault item object
 * @param {CryptoKey} symmetricKey
 * @returns {string} base64-encoded (iv || ciphertext)
 */
export async function encryptItem(plainItem, symmetricKey) {
  const iv = randomBytes(IV_BYTES);
  const data = new TextEncoder().encode(JSON.stringify(plainItem));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    symmetricKey,
    data
  );

  const combined = concatUint8Arrays(iv, new Uint8Array(encrypted));
  return uint8ArrayToBase64(combined);
}

/**
 * Decrypt a vault item.
 *
 * @param {string} encryptedB64 - base64 from encryptItem
 * @param {CryptoKey} symmetricKey
 * @returns {object} decrypted vault item
 */
export async function decryptItem(encryptedB64, symmetricKey) {
  const data = base64ToUint8Array(encryptedB64);
  const iv = data.slice(0, IV_BYTES);
  const ciphertext = data.slice(IV_BYTES);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    symmetricKey,
    ciphertext
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ─── Full Registration Flow ───────────────────────────────────────────────────

/**
 * Prepare all cryptographic material for a new registration.
 * Returns everything needed to call /api/auth/register.
 */
export async function prepareRegistration(password, email, kdfParams = DEFAULT_KDF_PARAMS) {
  // Generate random salt
  const salt = randomBytes(SALT_BYTES);
  const saltHex = uint8ArrayToHex(salt);

  const params = { ...kdfParams, salt: saltHex };

  // Derive master key
  const masterKey = await deriveMasterKey(password, salt, params);

  // Derive sub-keys
  const { vaultKey, authKeyHex } = await deriveSubKeys(masterKey);

  // Generate vault symmetric key
  const symmetricKey = await generateSymmetricKey();

  // Protect symmetric key with vault key
  const protectedSymmetricKey = await protectSymmetricKey(symmetricKey, vaultKey);

  return {
    masterPasswordHash: authKeyHex,
    kdfParams: params,
    protectedSymmetricKey,
    // Keep in memory for immediate use after registration
    _symmetricKey: symmetricKey,
    _vaultKey: vaultKey,
  };
}

// ─── Full Login Flow ──────────────────────────────────────────────────────────

/**
 * Reconstruct cryptographic keys from login data.
 * Returns the symmetric key for vault decryption.
 */
export async function prepareLogin(password, email, kdfParams, protectedSymmetricKey) {
  const salt = hexToUint8Array(kdfParams.salt);
  const masterKey = await deriveMasterKey(password, salt, kdfParams);
  const { vaultKey, authKeyHex } = await deriveSubKeys(masterKey);
  const symmetricKey = await unprotectSymmetricKey(protectedSymmetricKey, vaultKey);

  return { authKeyHex, symmetricKey };
}

// ─── Password Generator ───────────────────────────────────────────────────────

const CHARSET = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  ambiguous: 'il1Lo0O',
};

/**
 * Generate a cryptographically secure random password.
 */
export function generatePassword({
  length = 20,
  lowercase = true,
  uppercase = true,
  digits = true,
  symbols = true,
  excludeAmbiguous = false,
} = {}) {
  let charset = '';
  const required = [];

  if (lowercase) {
    let chars = CHARSET.lowercase;
    if (excludeAmbiguous) chars = chars.replace(/[il]/g, '');
    charset += chars;
    required.push(chars[Math.floor(secureRandom() * chars.length)]);
  }
  if (uppercase) {
    let chars = CHARSET.uppercase;
    if (excludeAmbiguous) chars = chars.replace(/[ILO]/g, '');
    charset += chars;
    required.push(chars[Math.floor(secureRandom() * chars.length)]);
  }
  if (digits) {
    let chars = CHARSET.digits;
    if (excludeAmbiguous) chars = chars.replace(/[10]/g, '');
    charset += chars;
    required.push(chars[Math.floor(secureRandom() * chars.length)]);
  }
  if (symbols) {
    charset += CHARSET.symbols;
    required.push(CHARSET.symbols[Math.floor(secureRandom() * CHARSET.symbols.length)]);
  }

  if (!charset) charset = CHARSET.lowercase;

  const remaining = length - required.length;
  const result = [...required];

  for (let i = 0; i < remaining; i++) {
    result.push(charset[Math.floor(secureRandom() * charset.length)]);
  }

  // Shuffle using Fisher-Yates with crypto random
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(secureRandom() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}

/** Return a cryptographically secure float in [0, 1) */
function secureRandom() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0] / (0xFFFFFFFF + 1);
}

// ─── Password Strength Scorer ─────────────────────────────────────────────────

/**
 * Score a password from 0 (very weak) to 4 (very strong).
 * Returns { score, label, suggestions }
 */
export function scorePassword(password) {
  if (!password) return { score: 0, label: '', suggestions: [] };

  const suggestions = [];
  let score = 0;

  if (password.length >= 8) score++;
  else suggestions.push('Use at least 8 characters');

  if (password.length >= 16) score++;
  else if (password.length >= 8) suggestions.push('Use at least 16 characters for better security');

  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  else suggestions.push('Mix uppercase and lowercase letters');

  if (/[0-9]/.test(password)) score++;
  else suggestions.push('Add numbers');

  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else suggestions.push('Add special characters (!@#$...)');

  // Cap at 4
  score = Math.min(score, 4);

  // Penalize common patterns
  if (/(.)\1{2,}/.test(password)) {
    score = Math.max(0, score - 1);
    suggestions.push('Avoid repeated characters');
  }

  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score], suggestions };
}

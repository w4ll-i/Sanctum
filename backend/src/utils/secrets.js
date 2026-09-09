const crypto = require('node:crypto');

/**
 * Ensures JWT secrets exist in process.env.
 * Priority: env var → settings DB → auto-generate + persist to DB.
 * Must be called after initDb() so the settings table exists.
 */
function ensureJwtSecrets(db) {
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const setSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  for (const envKey of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const dbKey = envKey.toLowerCase(); // jwt_access_secret / jwt_refresh_secret
    let secret = process.env[envKey];

    if (!secret || secret.startsWith('CHANGE_ME')) {
      const row = getSetting.get(dbKey);
      secret = row ? row.value : crypto.randomBytes(64).toString('hex');
      setSetting.run(dbKey, secret);
    }

    process.env[envKey] = secret;
  }
}

module.exports = { ensureJwtSecrets };

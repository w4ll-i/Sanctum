const express = require('express');
const { getDb } = require('../config/database');
const { apiLimiter } = require('../middleware/rateLimit');

const router = express.Router();

/**
 * GET /api/setup/status
 * Public. Returns whether setup has been completed and the instance name.
 */
router.get('/status', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('setup_done');
  const nameRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('instance_name');
  res.json({
    done: row?.value === 'true',
    instanceName: nameRow?.value || 'Sanctum',
  });
});

/**
 * POST /api/setup/configure
 * Public. No-op if setup is already done (idempotent protection).
 * Accepts { instanceName } only — CORS and domains are configured via .env.
 */
router.post('/configure', apiLimiter, (req, res) => {
  const db = getDb();
  const done = db.prepare('SELECT value FROM settings WHERE key = ?').get('setup_done');
  if (done?.value === 'true') return res.sendStatus(200);

  const { instanceName } = req.body;

  if (
    !instanceName ||
    typeof instanceName !== 'string' ||
    instanceName.trim().length === 0 ||
    instanceName.length > 50
  ) {
    return res.status(400).json({ error: 'instanceName must be 1-50 chars' });
  }

  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run('instance_name', instanceName.trim());

  res.sendStatus(200);
});

module.exports = router;

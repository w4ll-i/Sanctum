const express = require('express');
const { getDb } = require('../config/database');

const router = express.Router();

router.get('/', (req, res) => {
  let dbOk = false;
  try {
    getDb().prepare('SELECT 1').get();
    dbOk = true;
  } catch {}

  const status = dbOk ? 'ok' : 'degraded';
  return res.status(dbOk ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    db: dbOk ? 'ok' : 'error',
  });
});

module.exports = router;

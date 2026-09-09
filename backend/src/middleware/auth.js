const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

/**
 * Verify JWT access token and attach user to request.
 * Returns 401 if token is missing, invalid, or expired.
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
    });

    // Verify user still exists and is not locked
    const db = getDb();
    const user = db.prepare(
      'SELECT id, email, username, locked_until FROM users WHERE id = ?'
    ).get(payload.sub);

    if (!user) {
      return res.status(401).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    if (user.locked_until && user.locked_until > Date.now()) {
      const unlockIn = Math.ceil((user.locked_until - Date.now()) / 60000);
      return res.status(423).json({
        error: `Account locked. Try again in ${unlockIn} minute(s).`,
        code: 'ACCOUNT_LOCKED',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
  }
}

/**
 * Log an audit event to the database.
 */
function auditLog(db, { userId, action, req, success = true, details = null }) {
  try {
    const { generateId } = require('../utils/crypto');
    db.prepare(`
      INSERT INTO audit_log (id, user_id, action, ip_address, user_agent, success, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId(),
      userId || null,
      action,
      req.ip || null,
      req.headers['user-agent'] || null,
      success ? 1 : 0,
      details ? JSON.stringify(details) : null,
      Date.now()
    );
  } catch (e) {
    console.error('[AuditLog] Failed to write:', e.message);
  }
}

module.exports = { authenticate, auditLog };

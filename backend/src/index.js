require('dotenv').config();
const express = require('express');
const path = require('node:path');
const morgan = require('morgan');

const { initDb, getDb } = require('./config/database');
const { ensureJwtSecrets } = require('./utils/secrets');
const { configureHelmet, configureCors, additionalSecurityHeaders, configureCompression } = require('./middleware/security');

const { apiLimiter } = require('./middleware/rateLimit');

const authRoutes = require('./routes/auth');
const vaultRoutes = require('./routes/vault');
const totpRoutes = require('./routes/totp');
const healthRoutes = require('./routes/health');
const setupRoutes = require('./routes/setup');

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3000');

// --- Initialize database ---
initDb();
ensureJwtSecrets(getDb()); // must run after initDb so settings table exists

// --- Middleware stack ---
app.set('trust proxy', 1); // Trust first proxy (for accurate IP behind Docker/Nginx)

app.use(configureHelmet());
app.use(configureCors());
app.use(additionalSecurityHeaders);
app.use(configureCompression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// HTTP request logging (skip in test mode)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// --- API routes ---
app.use('/health', healthRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/vault', apiLimiter, vaultRoutes);
app.use('/api/totp', apiLimiter, totpRoutes);

// --- Serve frontend in production ---
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist, {
      maxAge: '1d',
      etag: true,
      lastModified: true,
    }));
    // SPA fallback — all non-API routes serve index.html
    app.get('*', (req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }
}

// --- Error handling ---
app.use((err, req, res, next) => {
  // CORS errors
  if (err.message?.startsWith('CORS:')) {
    return res.status(403).json({ error: 'CORS policy violation' });
  }

  console.error('[Error]', err.message);
  return res.status(500).json({ error: 'Internal server error' });
});

// 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// --- Start server ---
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Sanctum] Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

module.exports = app;

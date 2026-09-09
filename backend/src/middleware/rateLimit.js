const rateLimit = require('express-rate-limit');

function createRateLimiter(options = {}) {
  return rateLimit({
    windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: options.max || Number.parseInt(process.env.RATE_LIMIT_MAX || '100'),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
    },
    skip: (req) => {
      return req.path === '/health';
    },
    ...options,
  });
}

/** General API rate limiter */
const apiLimiter = createRateLimiter();

/** Strict limiter for authentication endpoints */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10'),
  message: {
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
});

/** Very strict limiter for registration */
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    error: 'Too many registration attempts from this IP.',
    code: 'REGISTER_RATE_LIMIT_EXCEEDED',
  },
});

module.exports = { apiLimiter, authLimiter, registerLimiter };

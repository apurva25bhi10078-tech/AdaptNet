const rateLimit = require('express-rate-limit');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });

module.exports = {
  // victims sending requests / missing-person reports
  publicWriteLimiter: make(60 * 1000, 60, 'Too many requests from this device. Please wait a minute.'),
  // batch uploads when a phone reconnects
  syncLimiter: make(60 * 1000, 10, 'Too many sync attempts. Please wait a minute.'),
  // password guessing protection
  loginLimiter: make(15 * 60 * 1000, 20, 'Too many login attempts. Try again later.'),
};

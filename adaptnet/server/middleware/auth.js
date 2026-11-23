const jwt = require('jsonwebtoken');
const config = require('../config');

function verifyToken(token) {
  return jwt.verify(token, config.JWT_SECRET);
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Only logged-in government staff can pass
function requireStaff(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Login required' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Only admins can pass
function requireAdmin(req, res, next) {
  requireStaff(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    next();
  });
}

// Lets everyone through, but identifies staff if a valid token is sent
function optionalStaff(req, res, next) {
  const token = readToken(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      /* ignore bad token, treat as public */
    }
  }
  next();
}

module.exports = { requireStaff, requireAdmin, optionalStaff, verifyToken };

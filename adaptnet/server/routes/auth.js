const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const config = require('../config');
const validate = require('../middleware/validate');
const { requireStaff, requireAdmin } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

const router = express.Router();

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const registerSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(100),
  name: z.string().trim().max(100).optional(),
  role: z.enum(['admin', 'staff']).default('staff'),
});

// POST /api/auth/login  ->  { token, user }
router.post('/login', loginLimiter, validate(loginSchema), (req, res) => {
  const { username, password } = req.valid;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
  res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

// POST /api/auth/register  (admin only) creates a new staff account
router.post('/register', requireAdmin, validate(registerSchema), (req, res) => {
  const { username, password, name, role } = req.valid;
  try {
    const info = db
      .prepare('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(username, name ?? null, bcrypt.hashSync(password, 10), role);
    res.status(201).json({ id: info.lastInsertRowid, username, name: name ?? null, role });
  } catch (err) {
    if (String(err.message).includes('users.username')) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    throw err;
  }
});

// GET /api/auth/me
router.get('/me', requireStaff, (req, res) => {
  res.json({ id: req.user.sub, username: req.user.username, role: req.user.role });
});

module.exports = router;

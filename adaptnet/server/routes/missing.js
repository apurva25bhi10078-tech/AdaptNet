const express = require('express');
const { z } = require('zod');
const db = require('../db');
const validate = require('../middleware/validate');
const { requireStaff, optionalStaff } = require('../middleware/auth');
const { publicWriteLimiter } = require('../middleware/rateLimit');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  age: z.number().int().min(0).max(120).optional(),
  gender: z.string().trim().max(20).optional(),
  last_seen_place: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  reporter_name: z.string().trim().max(100).optional(),
  reporter_phone: z.string().trim().max(20).optional(),
});

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['missing', 'found']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const statusSchema = z.object({ status: z.enum(['missing', 'found']) });

// Reporter contact details are private: only staff can see them
const publicView = (row) => {
  const { reporter_name, reporter_phone, ...rest } = row;
  return rest;
};

// POST /api/missing  - anyone can report a missing person
router.post('/', publicWriteLimiter, validate(createSchema), (req, res) => {
  const p = req.valid;
  const info = db
    .prepare(`INSERT INTO missing_persons
              (name, age, gender, last_seen_place, description, reporter_name, reporter_phone)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(p.name, p.age ?? null, p.gender ?? null, p.last_seen_place ?? null,
         p.description ?? null, p.reporter_name ?? null, p.reporter_phone ?? null);

  const row = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(info.lastInsertRowid);
  req.app.get('io').to('staff').emit('missing:new', row);
  res.status(201).json(publicView(row));
});

// GET /api/missing?q=name&status=missing  - anyone can search
router.get('/', optionalStaff, validate(listSchema, 'query'), (req, res) => {
  const { q, status, limit } = req.valid;
  const where = [];
  const params = [];

  if (status) { where.push('status = ?'); params.push(status); }
  if (q) {
    where.push('(name LIKE ? OR last_seen_place LIKE ? OR description LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const rows = db
    .prepare(`SELECT * FROM missing_persons
              ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
              ORDER BY reported_at DESC LIMIT ?`)
    .all(...params, limit);

  res.json(req.user ? rows : rows.map(publicView));
});

// PATCH /api/missing/:id  (staff) mark as found / missing
router.patch('/:id', requireStaff, validate(statusSchema), (req, res) => {
  const row = db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Record not found' });

  db.prepare('UPDATE missing_persons SET status = ?, updated_at = ? WHERE id = ?')
    .run(req.valid.status, new Date().toISOString(), row.id);

  logActivity(req.user.sub, `missing:${row.status}->${req.valid.status}`, null, { id: row.id });
  res.json(db.prepare('SELECT * FROM missing_persons WHERE id = ?').get(row.id));
});

module.exports = router;

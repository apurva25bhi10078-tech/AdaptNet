const express = require('express');
const { z } = require('zod');
const db = require('../db');
const validate = require('../middleware/validate');
const { requireStaff } = require('../middleware/auth');
const { publicWriteLimiter, syncLimiter } = require('../middleware/rateLimit');
const { NEEDS } = require('../utils/priority');
const { logActivity } = require('../utils/activity');
const { TYPES, STATUSES, saveRequest, toStaffJson, findById } = require('../services/requestService');

const router = express.Router();

// ---------- Validation schemas ----------

const requestSchema = z.object({
  id: z.string().uuid(), // created on the phone, makes re-sending safe
  type: z.enum(TYPES),
  message: z.string().trim().max(1000).default(''),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  people_count: z.number().int().min(1).max(500).default(1),
  special_needs: z.array(z.enum(NEEDS)).max(20).default([]),
  contact_name: z.string().trim().max(100).optional(),
  contact_phone: z.string().trim().max(20).optional(),
  created_at_device: z.string().datetime({ offset: true }).optional(),
});

const syncSchema = z.object({
  requests: z.array(z.unknown()).min(1).max(100),
});

const listSchema = z.object({
  status: z.enum(STATUSES).optional(),
  type: z.enum(TYPES).optional(),
  label: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  need: z.enum(NEEDS).optional(), // targeted relief, e.g. need=formula_milk
  min_score: z.coerce.number().int().min(0).max(100).optional(),
  since: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

const statusSchema = z.object({ status: z.enum(STATUSES) });

const replySchema = z.object({
  message: z.string().trim().min(1).max(500),
  status: z.enum(STATUSES).optional(),
});

// ---------- Helpers ----------

const io = (req) => req.app.get('io');

function announceNew(req, row) {
  io(req).to('staff').emit('request:new', toStaffJson(row));
}

// ---------- PUBLIC routes (victims, no login) ----------

// POST /api/requests  - send one help request
router.post('/', publicWriteLimiter, validate(requestSchema), (req, res) => {
  const { duplicate, row } = saveRequest(req.valid);
  if (!duplicate) announceNew(req, row);
  res.status(duplicate ? 200 : 201).json({
    id: row.id,
    tracking_code: row.tracking_code,
    status: row.status,
    duplicate,
  });
});

// POST /api/requests/sync  - a phone that was offline uploads everything it saved
router.post('/sync', syncLimiter, validate(syncSchema), (req, res) => {
  const results = req.valid.requests.map((item) => {
    const parsed = requestSchema.safeParse(item);
    const id = item && typeof item === 'object' ? item.id ?? null : null;
    if (!parsed.success) {
      return {
        id,
        ok: false,
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
    }
    const { duplicate, row } = saveRequest(parsed.data);
    if (!duplicate) announceNew(req, row);
    return { id: row.id, ok: true, tracking_code: row.tracking_code, status: row.status, duplicate };
  });

  res.json({
    saved: results.filter((r) => r.ok && !r.duplicate).length,
    duplicates: results.filter((r) => r.ok && r.duplicate).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
});

// GET /api/requests/track/:code  - victim checks status and government replies
router.get('/track/:code', (req, res) => {
  const row = db
    .prepare('SELECT * FROM requests WHERE tracking_code = ?')
    .get(req.params.code.toUpperCase());
  if (!row) return res.status(404).json({ error: 'No request found for this tracking code' });

  const replies = db
    .prepare('SELECT message, created_at FROM replies WHERE request_id = ? ORDER BY id ASC')
    .all(row.id);

  res.json({
    tracking_code: row.tracking_code,
    type: row.type,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    replies,
  });
});

// ---------- STAFF routes (login required) ----------

// GET /api/requests  - the dashboard list, most urgent first
router.get('/', requireStaff, validate(listSchema, 'query'), (req, res) => {
  const f = req.valid;
  const where = [];
  const params = [];

  if (f.status) { where.push('status = ?'); params.push(f.status); }
  if (f.type) { where.push('type = ?'); params.push(f.type); }
  if (f.label) { where.push('priority_label = ?'); params.push(f.label); }
  if (f.min_score != null) { where.push('priority_score >= ?'); params.push(f.min_score); }
  if (f.since) { where.push('created_at > ?'); params.push(f.since); }
  if (f.need) { where.push('special_needs LIKE ?'); params.push(`%"${f.need}"%`); }

  const sql = `
    SELECT * FROM requests
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE status WHEN 'done' THEN 1 ELSE 0 END, priority_score DESC, created_at ASC
    LIMIT ?`;
  params.push(f.limit);

  res.json(db.prepare(sql).all(...params).map(toStaffJson));
});

// GET /api/requests/stats/summary  - numbers for dashboard header
router.get('/stats/summary', requireStaff, (req, res) => {
  res.json({
    total: db.prepare('SELECT COUNT(*) AS n FROM requests').get().n,
    by_status: db.prepare('SELECT status, COUNT(*) AS count FROM requests GROUP BY status').all(),
    by_priority: db.prepare('SELECT priority_label AS label, COUNT(*) AS count FROM requests GROUP BY priority_label').all(),
    by_type: db.prepare('SELECT type, COUNT(*) AS count FROM requests GROUP BY type').all(),
  });
});

// GET /api/requests/:id  - one request with replies and history
router.get('/:id', requireStaff, (req, res) => {
  const row = findById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Request not found' });

  const replies = db
    .prepare('SELECT id, message, staff_id, created_at FROM replies WHERE request_id = ? ORDER BY id ASC')
    .all(row.id);
  const activity = db
    .prepare(`SELECT a.action, a.details, a.created_at, u.username
              FROM activity_log a LEFT JOIN users u ON u.id = a.user_id
              WHERE a.request_id = ? ORDER BY a.id ASC`)
    .all(row.id);

  res.json({ ...toStaffJson(row), replies, activity });
});

// PATCH /api/requests/:id  - change status (new / seen / on_the_way / done)
router.patch('/:id', requireStaff, validate(statusSchema), (req, res) => {
  const row = findById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Request not found' });

  db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?')
    .run(req.valid.status, new Date().toISOString(), row.id);
  const updated = findById.get(row.id);

  logActivity(req.user.sub, `status:${row.status}->${updated.status}`, row.id);
  io(req).to('staff').emit('request:updated', toStaffJson(updated));
  io(req).to(`track:${row.tracking_code}`).emit('status', {
    tracking_code: row.tracking_code,
    status: updated.status,
  });

  res.json(toStaffJson(updated));
});

// POST /api/requests/:id/reply  - government replies to the victim
router.post('/:id/reply', requireStaff, validate(replySchema), (req, res) => {
  const row = findById.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Request not found' });

  const { message, status } = req.valid;
  const now = new Date().toISOString();

  const info = db
    .prepare('INSERT INTO replies (request_id, staff_id, message, created_at) VALUES (?, ?, ?, ?)')
    .run(row.id, req.user.sub, message, now);

  // A reply to a brand-new request means someone has seen it
  const newStatus = status ?? (row.status === 'new' ? 'seen' : row.status);
  db.prepare('UPDATE requests SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, row.id);
  const updated = findById.get(row.id);

  logActivity(req.user.sub, 'reply', row.id, { message });
  io(req).to('staff').emit('request:updated', toStaffJson(updated));
  io(req).to(`track:${row.tracking_code}`).emit('reply', {
    tracking_code: row.tracking_code,
    message,
    status: newStatus,
    created_at: now,
  });

  res.status(201).json({ id: info.lastInsertRowid, message, status: newStatus, created_at: now });
});

module.exports = router;

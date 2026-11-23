const express = require('express');
const { z } = require('zod');
const db = require('../db');
const validate = require('../middleware/validate');
const { requireStaff } = require('../middleware/auth');
const { distanceKm } = require('../utils/geo');

const router = express.Router();

const campSchema = z.object({
  name: z.string().trim().min(1).max(150),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  capacity: z.number().int().min(0).default(0),
  available_beds: z.number().int().min(0).default(0),
  contact: z.string().trim().max(100).optional(),
  facilities: z.array(z.string().trim().max(50)).max(20).default([]), // e.g. ["medical", "food", "water"]
});

const listSchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const parseCamp = (row) => ({ ...row, facilities: JSON.parse(row.facilities || '[]') });

// GET /api/camps?lat=..&lng=..  -> nearest camps first (public)
router.get('/', validate(listSchema, 'query'), (req, res) => {
  const { lat, lng, limit } = req.valid;
  let camps = db.prepare('SELECT * FROM camps').all().map(parseCamp);

  if (lat != null && lng != null) {
    camps = camps
      .map((c) => ({
        ...c,
        distance_km: Math.round(distanceKm(lat, lng, c.latitude, c.longitude) * 10) / 10,
      }))
      .sort((a, b) => a.distance_km - b.distance_km);
  }
  res.json(camps.slice(0, limit));
});

// POST /api/camps  (staff)
router.post('/', requireStaff, validate(campSchema), (req, res) => {
  const c = req.valid;
  const info = db
    .prepare(`INSERT INTO camps (name, latitude, longitude, capacity, available_beds, contact, facilities)
              VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(c.name, c.latitude, c.longitude, c.capacity, c.available_beds, c.contact ?? null, JSON.stringify(c.facilities));

  const camp = parseCamp(db.prepare('SELECT * FROM camps WHERE id = ?').get(info.lastInsertRowid));
  req.app.get('io').emit('camp:updated', camp);
  res.status(201).json(camp);
});

// PATCH /api/camps/:id  (staff) e.g. update available beds
router.patch('/:id', requireStaff, validate(campSchema.partial()), (req, res) => {
  const existing = db.prepare('SELECT * FROM camps WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Camp not found' });

  const m = { ...parseCamp(existing), ...req.valid };
  db.prepare(`UPDATE camps SET name=?, latitude=?, longitude=?, capacity=?, available_beds=?,
              contact=?, facilities=?, updated_at=? WHERE id=?`)
    .run(m.name, m.latitude, m.longitude, m.capacity, m.available_beds, m.contact ?? null,
         JSON.stringify(m.facilities), new Date().toISOString(), existing.id);

  const camp = parseCamp(db.prepare('SELECT * FROM camps WHERE id = ?').get(existing.id));
  req.app.get('io').emit('camp:updated', camp);
  res.json(camp);
});

module.exports = router;

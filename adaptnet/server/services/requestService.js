const crypto = require('crypto');
const db = require('../db');
const { calculatePriority } = require('../utils/priority');

const TYPES = ['medical', 'rescue', 'food', 'shelter', 'other'];
const STATUSES = ['new', 'seen', 'on_the_way', 'done'];

// No 0/O/1/I so codes are easy to read out loud
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateTrackingCode() {
  let code = 'AN-';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return code;
}

const findById = db.prepare('SELECT * FROM requests WHERE id = ?');
const insertStmt = db.prepare(`
  INSERT INTO requests
    (id, tracking_code, type, message, latitude, longitude, people_count, special_needs,
     contact_name, contact_phone, priority_score, priority_label, created_at_device)
  VALUES
    (@id, @tracking_code, @type, @message, @latitude, @longitude, @people_count, @special_needs,
     @contact_name, @contact_phone, @priority_score, @priority_label, @created_at_device)
`);

// Saves one request. If the same id was already saved (phone re-sent it), nothing new is created.
function saveRequest(data) {
  const existing = findById.get(data.id);
  if (existing) return { duplicate: true, row: existing };

  const { score, label } = calculatePriority(data);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      insertStmt.run({
        id: data.id,
        tracking_code: generateTrackingCode(),
        type: data.type,
        message: data.message ?? '',
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        people_count: data.people_count ?? 1,
        special_needs: JSON.stringify(data.special_needs ?? []),
        contact_name: data.contact_name ?? null,
        contact_phone: data.contact_phone ?? null,
        priority_score: score,
        priority_label: label,
        created_at_device: data.created_at_device ?? null,
      });
      return { duplicate: false, row: findById.get(data.id) };
    } catch (err) {
      // extremely rare: random tracking code already used, so try another
      if (String(err.message).includes('requests.tracking_code')) continue;
      throw err;
    }
  }
  throw new Error('Could not generate a unique tracking code');
}

// Full details for government staff
function toStaffJson(row) {
  return { ...row, special_needs: JSON.parse(row.special_needs || '[]') };
}

module.exports = { TYPES, STATUSES, saveRequest, toStaffJson, generateTrackingCode, findById };

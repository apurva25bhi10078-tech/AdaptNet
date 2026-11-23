const db = require('../db');

const stmt = db.prepare(
  'INSERT INTO activity_log (user_id, action, request_id, details) VALUES (?, ?, ?, ?)'
);

// Records who did what (an audit trail)
function logActivity(userId, action, requestId = null, details = null) {
  stmt.run(userId ?? null, action, requestId, details ? JSON.stringify(details) : null);
}

module.exports = { logActivity };

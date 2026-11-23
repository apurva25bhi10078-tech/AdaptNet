const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(process.env.DB_FILE || path.join(dataDir, 'adaptnet.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ISO-8601 UTC timestamp, e.g. 2026-11-16T10:30:00.000Z
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`;

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  created_at    TEXT NOT NULL DEFAULT (${NOW})
);

-- id is a UUID created ON THE PHONE, so re-sending the same request never creates a duplicate
CREATE TABLE IF NOT EXISTS requests (
  id                TEXT PRIMARY KEY,
  tracking_code     TEXT NOT NULL UNIQUE,
  type              TEXT NOT NULL CHECK (type IN ('medical','rescue','food','shelter','other')),
  message           TEXT NOT NULL DEFAULT '',
  latitude          REAL,
  longitude         REAL,
  people_count      INTEGER NOT NULL DEFAULT 1,
  special_needs     TEXT NOT NULL DEFAULT '[]',
  contact_name      TEXT,
  contact_phone     TEXT,
  priority_score    INTEGER NOT NULL DEFAULT 0,
  priority_label    TEXT NOT NULL DEFAULT 'low',
  status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','on_the_way','done')),
  created_at_device TEXT,
  created_at        TEXT NOT NULL DEFAULT (${NOW}),
  updated_at        TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_requests_status   ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_priority ON requests(priority_score DESC);

CREATE TABLE IF NOT EXISTS replies (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  staff_id   INTEGER,
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_replies_request ON replies(request_id);

CREATE TABLE IF NOT EXISTS camps (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  latitude       REAL NOT NULL,
  longitude      REAL NOT NULL,
  capacity       INTEGER NOT NULL DEFAULT 0,
  available_beds INTEGER NOT NULL DEFAULT 0,
  contact        TEXT,
  facilities     TEXT NOT NULL DEFAULT '[]',
  updated_at     TEXT NOT NULL DEFAULT (${NOW})
);

CREATE TABLE IF NOT EXISTS missing_persons (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  age             INTEGER,
  gender          TEXT,
  last_seen_place TEXT,
  description     TEXT,
  reporter_name   TEXT,
  reporter_phone  TEXT,
  status          TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing','found')),
  reported_at     TEXT NOT NULL DEFAULT (${NOW}),
  updated_at      TEXT NOT NULL DEFAULT (${NOW})
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  action     TEXT NOT NULL,
  request_id TEXT,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_activity_request ON activity_log(request_id);
`);

module.exports = db;

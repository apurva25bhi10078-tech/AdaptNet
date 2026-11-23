# AdaptNet Server

Backend for **AdaptNet**, an offline-first disaster relief communication system.
Victims send help requests (even with no internet), government staff see them
live on a dashboard, prioritised by urgency, and reply back.

**Stack:** Node.js, Express 5, SQLite (better-sqlite3), Socket.IO, JWT, zod

## Quick start

```bash
cd server
npm install
cp .env.example .env        # then edit .env (Windows: copy .env.example .env)
npm run seed:demo           # creates admin login, sample camps, sample requests
npm start                   # http://localhost:3000
npm test                    # runs 31 end-to-end checks (server must be running)
```

When the server starts it prints a **Network** address. Open it on a phone
connected to the same Wi-Fi or hotspot. This works with no internet at all.

## How the offline part works

1. The phone creates a **UUID** for each request *before* sending it, and saves it locally.
2. When a connection is available (home Wi-Fi, camp hotspot, mesh gateway) the phone
   sends everything it saved in one call: `POST /api/requests/sync`.
3. The server ignores any `id` it has already stored, so retries never create duplicates.
4. Each request carries `created_at_device` (the time on the phone), so the real time of
   the emergency is kept even if it was delivered hours later.

## Priority scoring (`utils/priority.js`)

Base score by type (medical 70, rescue 60, shelter 30, food 25, other 10), plus points for
vulnerable people (baby, pregnant, injured, elderly...), number of people, and danger words
in the message ("trapped", "bleeding"...). Labels: `critical` 85+, `high` 65+, `medium` 40+, `low`.

## API

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | server alive? |
| GET | `/api/meta` | public | request types, statuses, need options (for building forms) |
| POST | `/api/auth/login` | public | staff login, returns token |
| POST | `/api/auth/register` | admin | create staff account |
| GET | `/api/auth/me` | staff | who am I |
| POST | `/api/requests` | public | send one help request |
| POST | `/api/requests/sync` | public | upload up to 100 saved requests at once |
| GET | `/api/requests/track/:code` | public | status + replies for a tracking code |
| GET | `/api/requests` | staff | list, most urgent first. Filters: `status`, `type`, `label`, `need`, `min_score`, `since`, `limit` |
| GET | `/api/requests/stats/summary` | staff | counts for dashboard header |
| GET | `/api/requests/:id` | staff | one request with replies and history |
| PATCH | `/api/requests/:id` | staff | change status |
| POST | `/api/requests/:id/reply` | staff | reply to the victim |
| GET | `/api/camps?lat=&lng=` | public | nearest camps first |
| POST / PATCH | `/api/camps`, `/api/camps/:id` | staff | add camp / update beds |
| POST | `/api/missing` | public | report a missing person |
| GET | `/api/missing?q=&status=` | public | search (reporter contact hidden unless staff) |
| PATCH | `/api/missing/:id` | staff | mark found / missing |

Staff routes need the header `Authorization: Bearer <token>`.

### Example: send a request

```bash
curl -X POST http://localhost:3000/api/requests -H "Content-Type: application/json" -d '{
  "id": "3f0c2a6e-8d5b-4c3e-9a41-2b7e6d1f9c10",
  "type": "rescue",
  "message": "Trapped on first floor, mother with a baby",
  "latitude": 28.61, "longitude": 77.2,
  "people_count": 3,
  "special_needs": ["baby", "formula_milk"]
}'
# -> { "id": "...", "tracking_code": "AN-7K3F9Q", "status": "new", "duplicate": false }
```

## Real-time events (Socket.IO)

```js
// Dashboard (staff): connect with the login token
const socket = io(URL, { auth: { token } });
socket.on('request:new', (req) => { /* add to list */ });
socket.on('request:updated', (req) => { /* refresh row */ });
socket.on('camp:updated', (camp) => {});
socket.on('missing:new', (person) => {});

// Victim phone: listen using the tracking code
const socket = io(URL);
socket.emit('track', 'AN-7K3F9Q');
socket.on('reply', ({ message, status }) => {});
socket.on('status', ({ status }) => {});
```

## Project structure

```
server/
  index.js                 server + Socket.IO setup
  config.js  db.js         settings and database tables
  seed.js                  admin user, sample camps, demo requests
  routes/                  auth, requests, camps, missing
  middleware/              login checks, rate limits, validation
  services/requestService  saving requests safely (duplicate protection)
  utils/                   priority scoring, distance, audit log
  test/smoke.js            end-to-end tests
```

## Before you deploy

- Set a strong `JWT_SECRET` and `ADMIN_PASSWORD` in `.env`.
- Set `TRUST_PROXY=1` on hosts like Render or Railway.
- Free hosts may reset the SQLite file on restart. For a permanent demo, attach a disk or switch to Postgres.
- Use HTTPS in production. Browsers only allow GPS and service workers on HTTPS (localhost is the exception).

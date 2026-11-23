# AdaptNet

**An offline-first disaster relief communication system.**

When floods, earthquakes or cyclones knock out mobile networks, people cannot call for help and relief teams cannot see who needs it. AdaptNet lets victims send help requests that are **saved on their phone and sent automatically the moment any connection appears** (a camp hotspot, a gateway laptop, or a restored tower). Government teams and relief camps see every request live, ranked by urgency, and can reply directly.

---

## Features

### For victims (Progressive Web App)
- Large, simple buttons: Medical, Rescue, Food/Water, Shelter
- Number of people, special needs (baby, elderly, injured, pregnant, medicines, baby milk...) and a free-text message
- One-tap GPS location, with a fallback to describing the location in text
- **Offline queue:** requests are stored on the phone first and retried automatically until delivered
- Tracking code (for example `AN-7K3F9Q`) to check status and read replies from the relief team
- Nearest relief camps, with the last list cached for offline viewing

### For government staff (Command Dashboard)
- Live list of requests, **sorted by priority** (critical, high, medium, low)
- Live map with colour-coded markers
- Instant updates through WebSockets, with a sound alert for urgent requests
- Status workflow: new, seen, on the way, done
- Reply to victims with quick-reply templates
- Filter by status, with open / critical / done counters

### For relief camps (Camp Manager)
- Update free beds and available facilities (food, water, medical, ambulance...)
- Add new camps with their location
- See open help requests **nearest to the camp** and invite victims to the camp in one click
- Search, report and mark missing persons as found

### Backend
- REST API with JWT login for staff and public endpoints for victims
- **Duplicate-safe sync:** every request has an ID created on the phone, so re-sending never creates duplicates
- Priority scoring based on request type, vulnerable people, group size and danger words
- Targeted relief filters (for example all requests that need baby milk)
- Rate limiting, input validation and an audit log of staff actions

---

## How the offline part works

```
Phone (no internet)                         Server (laptop / gateway / cloud)
-------------------                         ---------------------------------
1. Create request with a UUID
2. Save in local storage            ...
3. Retry every 10 seconds   ----- connection appears ----->  4. POST /api/requests/sync
                                                              5. Ignore IDs already stored
                                                              6. Score priority, save
                                                              7. Push to dashboards live
8. Show tracking code        <-----------------------------  9. Staff reply arrives instantly
```

The whole system can run on a single laptop with its own Wi-Fi hotspot, so it works with **no internet at all**.

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 5 |
| Database | SQLite (better-sqlite3) |
| Real-time | Socket.IO |
| Security | JWT, bcryptjs, express-rate-limit, zod validation |
| Frontend | HTML, CSS, JavaScript, Progressive Web App (service worker + manifest) |
| Map | Leaflet (bundled locally, no CDN needed) |

---

## Project structure

```
adaptnet/
├── server/
│   ├── index.js              server and Socket.IO setup
│   ├── config.js, db.js      settings and database tables
│   ├── seed.js               admin user, sample camps, demo requests
│   ├── routes/               auth, requests, camps, missing
│   ├── middleware/           login checks, rate limits, validation
│   ├── services/             request saving with duplicate protection
│   ├── utils/                priority scoring, distance, audit log
│   └── test/smoke.js         end-to-end test suite
└── client/
    ├── index.html            victim app
    ├── dashboard.html        government dashboard
    ├── camp.html             camp manager
    ├── sw.js, manifest.json  offline support and installability
    └── vendor/               Leaflet
```

---

## Getting started

**Requirements:** Node.js 18 or newer ([nodejs.org](https://nodejs.org), LTS version)

```bash
cd server
npm install
cp .env.example .env          # Windows: copy .env.example .env
```

Open `.env` and set your own values:

```
JWT_SECRET=a-long-random-text
ADMIN_PASSWORD=your-own-password
```

Then:

```bash
npm run seed:demo             # creates the admin login, 3 camps and 6 sample requests
npm start                     # starts on http://localhost:3000
```

The server prints a **Network** address as well. Open it on a phone that is on the same Wi-Fi or hotspot.

| Screen | Address |
|---|---|
| Victim app | `http://localhost:3000/` |
| Government dashboard | `http://localhost:3000/dashboard.html` |
| Camp manager | `http://localhost:3000/camp.html` |

Staff login: username `admin`, password from your `.env`.

### Run the tests

With the server running, open a second terminal:

```bash
cd server
npm test
```

The backend test suite checks login, sending requests, duplicate protection, batch sync, live events, replies reaching the victim, camps and missing persons.

---

## Try the offline demo

1. Open the victim app on a phone and the dashboard on a laptop.
2. Stop the server (or turn off the phone's Wi-Fi).
3. Send a help request. It is saved and shows **Waiting to send**.
4. Start the server again (or reconnect).
5. Within about 10 seconds the request is delivered and appears on the dashboard with a tracking code.
6. Reply from the dashboard. The reply appears on the victim's phone instantly.

---

## API overview

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/login` | public | Staff login |
| POST | `/api/requests` | public | Send one help request |
| POST | `/api/requests/sync` | public | Upload up to 100 saved requests |
| GET | `/api/requests/track/:code` | public | Status and replies for a tracking code |
| GET | `/api/requests` | staff | List requests, most urgent first |
| PATCH | `/api/requests/:id` | staff | Change status |
| POST | `/api/requests/:id/reply` | staff | Reply to the victim |
| GET | `/api/camps?lat=&lng=` | public | Nearest camps first |
| POST / PATCH | `/api/camps` | staff | Add or update a camp |
| POST / GET | `/api/missing` | public | Report and search missing persons |
| PATCH | `/api/missing/:id` | staff | Mark found |

The full list of endpoints, filters and Socket.IO events is in `server/README.md`.

---

## Known limitations

- **GPS and the offline page cache need HTTPS.** Browsers allow them only on `localhost` or HTTPS, so on a phone using a plain `http://192.168...` address they may be blocked. Victims can still describe their location in the message. A local HTTPS certificate or a Capacitor Android build removes this limit.
- **Map tiles need internet.** Without a connection the map background is blank, but markers and the full request list still work.
- **No phone-to-phone mesh yet.** Delivery needs a device that can reach the server.
- **Staff accounts** are created through the API (`POST /api/auth/register`). There is no management screen yet.
- Free hosting platforms may reset the SQLite file on restart.

## Future work

- Bluetooth / Wi-Fi Direct mesh and LoRa radio links for delivery with no gateway
- Android build with Capacitor
- Offline map tiles
- Staff user management screen
- Multi-language interface (Hindi and regional languages)
- SMS fallback for basic phones

---

## Security notes

- Set a strong `JWT_SECRET` and `ADMIN_PASSWORD` before any real deployment.
- Use HTTPS in production.
- Victim contact details are visible only to logged-in staff.
- Public endpoints are rate limited and all input is validated.

## License

MIT

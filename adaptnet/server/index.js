const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const db = require('./db');
const { verifyToken } = require('./middleware/auth');
const { TYPES, STATUSES } = require('./services/requestService');
const { NEEDS } = require('./utils/priority');

const app = express();
const server = http.createServer(app);

// Real-time channel: dashboard gets new requests instantly, victims get replies instantly
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

// Needed on hosts like Render/Railway so rate limiting sees the real device IP
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------- Socket.IO ----------
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    try {
      socket.data.user = verifyToken(token); // staff
    } catch {
      /* bad token: treat as an anonymous victim connection */
    }
  }
  next();
});

io.on('connection', (socket) => {
  if (socket.data.user) socket.join('staff');

  // A victim's phone listens for updates on its own tracking code
  socket.on('track', (code, ack) => {
    const clean = String(code || '').toUpperCase();
    const ok = /^AN-[A-Z0-9]{6}$/.test(clean);
    if (ok) socket.join(`track:${clean}`);
    if (typeof ack === 'function') ack({ ok });
  });
});

// ---------- API routes ----------
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Lets the frontend build its forms from one source of truth
app.get('/api/meta', (req, res) => res.json({ types: TYPES, statuses: STATUSES, needs: NEEDS }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/camps', require('./routes/camps'));
app.use('/api/missing', require('./routes/missing'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the frontend (victim app + dashboard) if a ../client folder exists
const clientDir = path.join(__dirname, '..', 'client');
if (fs.existsSync(clientDir)) app.use(express.static(clientDir));

// ---------- Error handler ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ---------- Start ----------
server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`\nAdaptNet server running on port ${config.PORT}`);
  console.log(`  Local:   http://localhost:${config.PORT}`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`  Network: http://${net.address}:${config.PORT}   <- open this on a phone on the same Wi-Fi/hotspot`);
      }
    }
  }
  console.log('');
});

function shutdown() {
  console.log('\nShutting down...');
  io.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// End-to-end test. Start the server first (npm start), then run: npm test
// Needs the admin account to exist (npm run seed).
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const USER = process.env.ADMIN_USERNAME || 'admin';
const PASS = process.env.ADMIN_PASSWORD || 'admin12345';

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
}

const waitFor = (socket, event, ms = 3000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
    socket.once(event, (payload) => { clearTimeout(t); resolve(payload); });
  });

(async () => {
  console.log(`\nTesting ${BASE}\n`);

  console.log('Health and auth');
  let r = await api('GET', '/api/health');
  check('health endpoint works', r.status === 200 && r.data.status === 'ok');

  r = await api('GET', '/api/does-not-exist');
  check('unknown API route gives 404 JSON', r.status === 404);

  r = await api('POST', '/api/auth/login', { username: USER, password: 'wrong-password' });
  check('wrong password is rejected', r.status === 401);

  r = await api('POST', '/api/auth/login', { username: USER, password: PASS });
  check('admin can log in', r.status === 200 && !!r.data.token, r.data);
  const token = r.data.token;

  r = await api('GET', '/api/requests');
  check('dashboard list needs login', r.status === 401);

  console.log('\nHelp requests and offline sync');
  const staffSocket = io(BASE, { auth: { token } });
  await waitFor(staffSocket, 'connect');

  const id = crypto.randomUUID();
  const body = {
    id, type: 'rescue', message: 'Trapped on roof with a baby', latitude: 28.61, longitude: 77.2,
    people_count: 3, special_needs: ['baby', 'formula_milk'], created_at_device: new Date().toISOString(),
  };

  const liveEvent = waitFor(staffSocket, 'request:new');
  r = await api('POST', '/api/requests', body);
  check('victim can send a request without login', r.status === 201 && /^AN-[A-Z0-9]{6}$/.test(r.data.tracking_code), r.data);
  const code = r.data.tracking_code;
  const live = await liveEvent.catch(() => null);
  check('dashboard receives it live via socket', live && live.id === id);

  r = await api('POST', '/api/requests', body);
  check('re-sending the same request creates no duplicate', r.status === 200 && r.data.duplicate === true && r.data.tracking_code === code, r.data);

  r = await api('POST', '/api/requests', { id: 'not-a-uuid', type: 'volcano' });
  check('bad data is rejected with details', r.status === 400 && r.data.details.length > 0);

  const syncBatch = [
    body, // duplicate
    { id: crypto.randomUUID(), type: 'medical', message: 'Man bleeding heavily', special_needs: ['injured'], people_count: 1 },
    { id: crypto.randomUUID(), type: 'food', message: 'Need food for family', people_count: 5 },
    { id: 'broken', type: 'nope' }, // invalid
  ];
  r = await api('POST', '/api/requests/sync', { requests: syncBatch });
  check('batch sync: 2 saved, 1 duplicate, 1 failed',
    r.status === 200 && r.data.saved === 2 && r.data.duplicates === 1 && r.data.failed === 1, r.data);

  console.log('\nDashboard');
  r = await api('GET', '/api/requests', undefined, token);
  check('staff can list requests', r.status === 200 && r.data.length >= 3);
  const scores = r.data.filter((x) => x.status !== 'done').map((x) => x.priority_score);
  check('sorted by priority, highest first', scores.every((s, i) => i === 0 || scores[i - 1] >= s), scores);
  check('baby + trapped + 3 people = critical', r.data.find((x) => x.id === id).priority_label === 'critical');

  r = await api('GET', '/api/requests?need=formula_milk', undefined, token);
  check('targeted relief filter (need=formula_milk)', r.status === 200 && r.data.length >= 1 && r.data.every((x) => x.special_needs.includes('formula_milk')));

  r = await api('GET', '/api/requests?label=critical&status=new', undefined, token);
  check('filter by label and status', r.status === 200 && r.data.every((x) => x.priority_label === 'critical'));

  r = await api('GET', '/api/requests/stats/summary', undefined, token);
  check('stats summary works', r.status === 200 && r.data.total >= 3);

  console.log('\nGovernment reply reaches the victim');
  const victim = io(BASE);
  await waitFor(victim, 'connect');
  const ack = await victim.emitWithAck('track', code);
  check('victim phone subscribes to its tracking code', ack.ok === true);

  const replyEvent = waitFor(victim, 'reply');
  r = await api('POST', `/api/requests/${id}/reply`, { message: 'Boat team is on the way. Stay on the roof.', status: 'on_the_way' }, token);
  check('staff can reply', r.status === 201, r.data);
  const got = await replyEvent.catch(() => null);
  check('victim receives the reply instantly', got && got.message.startsWith('Boat team'));

  r = await api('GET', `/api/requests/track/${code}`);
  check('victim can check status by tracking code', r.status === 200 && r.data.status === 'on_the_way' && r.data.replies.length === 1, r.data);
  check('tracking response hides private details', r.data.contact_phone === undefined && r.data.latitude === undefined);

  r = await api('PATCH', `/api/requests/${id}`, { status: 'done' }, token);
  check('staff can change status', r.status === 200 && r.data.status === 'done');

  r = await api('GET', `/api/requests/${id}`, undefined, token);
  check('request detail includes history', r.status === 200 && r.data.activity.length >= 2, r.data.activity);

  console.log('\nCamps');
  r = await api('GET', '/api/camps?lat=28.61&lng=77.2');
  check('camps are listed nearest first', r.status === 200 && r.data.length >= 1 && r.data.every((c, i) => i === 0 || r.data[i - 1].distance_km <= c.distance_km), r.data.map((c) => c.distance_km));

  r = await api('POST', '/api/camps', { name: 'Test Camp', latitude: 28.62, longitude: 77.21, capacity: 50, available_beds: 50, facilities: ['water'] });
  check('creating a camp needs login', r.status === 401);
  r = await api('POST', '/api/camps', { name: 'Test Camp', latitude: 28.62, longitude: 77.21, capacity: 50, available_beds: 50, facilities: ['water'] }, token);
  check('staff can add a camp', r.status === 201);
  r = await api('PATCH', `/api/camps/${r.data.id}`, { available_beds: 10 }, token);
  check('staff can update available beds', r.status === 200 && r.data.available_beds === 10);

  console.log('\nMissing persons');
  r = await api('POST', '/api/missing', { name: 'Ravi Kumar', age: 8, last_seen_place: 'Near the bus stand', reporter_phone: '9999999999' });
  check('anyone can report a missing person', r.status === 201 && r.data.reporter_phone === undefined);
  const missingId = r.data.id;
  r = await api('GET', '/api/missing?q=ravi');
  check('public search works and hides reporter phone', r.status === 200 && r.data.length >= 1 && r.data[0].reporter_phone === undefined);
  r = await api('GET', '/api/missing?q=ravi', undefined, token);
  check('staff can see reporter phone', r.data[0].reporter_phone === '9999999999');
  r = await api('PATCH', `/api/missing/${missingId}`, { status: 'found' }, token);
  check('staff can mark person as found', r.status === 200 && r.data.status === 'found');

  staffSocket.close();
  victim.close();

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('\nTest crashed:', err);
  process.exit(1);
});

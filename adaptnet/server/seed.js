// Run:  npm run seed         -> creates the admin login + sample rescue camps
//       npm run seed:demo    -> also adds sample help requests so the dashboard isn't empty
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');
const { saveRequest } = require('./services/requestService');

// Centre point for demo data. Change these to your own city.
const CENTER = { lat: 28.6139, lng: 77.209 };
const near = (dLat, dLng) => ({ latitude: +(CENTER.lat + dLat).toFixed(5), longitude: +(CENTER.lng + dLng).toFixed(5) });

// 1. Admin account
if (!db.prepare('SELECT id FROM users WHERE username = ?').get(config.ADMIN_USERNAME)) {
  db.prepare('INSERT INTO users (username, name, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(config.ADMIN_USERNAME, 'Administrator', bcrypt.hashSync(config.ADMIN_PASSWORD, 10), 'admin');
  console.log(`Created admin user "${config.ADMIN_USERNAME}"`);
  if (config.ADMIN_PASSWORD === 'admin12345') {
    console.warn('  WARNING: default password in use. Set ADMIN_PASSWORD in .env and re-seed on a fresh database.');
  }
} else {
  console.log(`Admin user "${config.ADMIN_USERNAME}" already exists`);
}

// 2. Sample camps
if (db.prepare('SELECT COUNT(*) AS n FROM camps').get().n === 0) {
  const camps = [
    ['Government School Relief Camp', near(0.02, 0.01), 300, 120, '+91-90000-00001', ['food', 'water', 'medical']],
    ['Community Hall Shelter', near(-0.03, 0.04), 150, 40, '+91-90000-00002', ['food', 'water']],
    ['District Hospital Field Camp', near(0.05, -0.02), 200, 15, '+91-90000-00003', ['medical', 'ambulance', 'water']],
  ];
  const ins = db.prepare(`INSERT INTO camps (name, latitude, longitude, capacity, available_beds, contact, facilities)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const [name, loc, cap, beds, contact, fac] of camps) {
    ins.run(name, loc.latitude, loc.longitude, cap, beds, contact, JSON.stringify(fac));
  }
  console.log(`Added ${camps.length} sample camps`);
}

// 3. Optional demo requests
if (process.argv.includes('--demo')) {
  const demo = [
    { type: 'medical', message: 'Elderly man with chest pain, cannot walk', special_needs: ['elderly'], people_count: 1, ...near(0.004, 0.003) },
    { type: 'rescue', message: 'Trapped on first floor, water rising. Mother with a baby', special_needs: ['baby'], people_count: 3, ...near(-0.006, 0.008) },
    { type: 'food', message: 'No food since yesterday', people_count: 6, ...near(0.012, -0.005) },
    { type: 'rescue', message: 'Roof collapsed, neighbour injured', special_needs: ['injured'], people_count: 2, ...near(-0.01, -0.012) },
    { type: 'shelter', message: 'House flooded, need a place to stay tonight', people_count: 4, ...near(0.02, 0.015) },
    { type: 'other', message: 'Need baby formula and diapers', special_needs: ['baby', 'formula_milk', 'diapers'], people_count: 2, ...near(-0.018, 0.006) },
  ];
  for (const d of demo) saveRequest({ id: crypto.randomUUID(), ...d });
  console.log(`Added ${demo.length} demo requests`);
}

db.close();
console.log('Seed complete.');

require('dotenv').config({ quiet: true });

const DEFAULT_SECRET = 'dev-only-secret-change-me';

const config = {
  PORT: Number(process.env.PORT) || 3000,
  JWT_SECRET: process.env.JWT_SECRET || DEFAULT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '12h',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin12345',
};

if (config.JWT_SECRET === DEFAULT_SECRET) {
  console.warn('[config] WARNING: using the default JWT_SECRET. Set a real one in .env before deploying.');
}

module.exports = config;

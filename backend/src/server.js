'use strict';
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { createApp } = require('./app');

const app = createApp();

async function start() {
  await connectDB();
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.log(`FocusBridge API listening on http://localhost:${env.port} and http://127.0.0.1:${env.port}`);
  });
  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error('Failed to start FocusBridge API', err);
    process.exit(1);
  });
}

module.exports = app;

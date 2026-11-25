'use strict';
// Usage:
//   npm run jobs            -> one reminder pass, then exit (use with cron or a hosting scheduler)
//   npm run jobs:loop       -> repeat every JOBS_INTERVAL_MINUTES (default 15) until stopped
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const { runReminderPass } = require('../src/jobs/reminders');

const loop = process.argv.includes('--loop');
const every = Number(process.env.JOBS_INTERVAL_MINUTES) || 15;

async function once() {
  const result = await runReminderPass(new Date());
  console.log(new Date().toISOString(), 'reminders', result);
}

(async () => {
  await connectDB();
  await once();
  if (loop) {
    setInterval(() => once().catch((e) => console.error(e)), every * 60 * 1000);
  } else {
    await mongoose.disconnect();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

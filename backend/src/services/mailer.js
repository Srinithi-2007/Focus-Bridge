'use strict';
// Phase 1 mailer: no real email provider is configured yet. Links are written to the server log so
// invitation and reset flows can be tested locally. Replace this module with SMTP/provider code later
// (credentials must come from environment variables, never from source).
const env = require('../config/env');

async function sendMail({ to, subject, text }) {
  if (env.isProd) {
    console.warn(`[mailer] Email provider not configured; message to ${to} ("${subject}") was not sent.`);
    return { delivered: false };
  }
  console.log(`[mailer:dev] to=${to} subject="${subject}"\n${text}\n`);
  return { delivered: false, dev: true };
}

module.exports = { sendMail };

'use strict';
const Notification = require('../models/Notification');

// Creates a notification. A duplicate dedupeKey is silently ignored, so repeated reminder runs never double-notify.
async function notify({ organizationId, userId, type, title, body = '', link = '', dedupeKey = null }) {
  try {
    await Notification.create({ organizationId, userId, type, title, body: body.slice(0, 500), link, dedupeKey });
    return true;
  } catch (err) {
    if (err && err.code === 11000) return false;
    console.error('[notify] failed', err.message);
    return false;
  }
}

module.exports = { notify };

'use strict';
const crypto = require('crypto');

// Opaque one-time tokens: the raw token goes to the user, only its SHA-256 is stored.
function createOpaqueToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

module.exports = { createOpaqueToken, hashToken };

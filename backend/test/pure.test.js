'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { passwordSchema } = require('../src/utils/password');
const { createOpaqueToken, hashToken } = require('../src/utils/tokens');
const AppError = require('../src/utils/AppError');

test('password policy rejects weak passwords and accepts strong ones', () => {
  assert.equal(passwordSchema.safeParse('short1A').success, false);
  assert.equal(passwordSchema.safeParse('alllowercase1').success, false);
  assert.equal(passwordSchema.safeParse('NoDigitsHere').success, false);
  assert.equal(passwordSchema.safeParse('GoodPassword1').success, true);
});

test('opaque tokens: stored hash matches raw token and is not the raw token', () => {
  const { raw, hash } = createOpaqueToken();
  assert.notEqual(raw, hash);
  assert.equal(hashToken(raw), hash);
  assert.equal(raw.length, 64);
});

test('AppError carries an HTTP status', () => {
  const err = new AppError(403, 'nope');
  assert.equal(err.status, 403);
  assert.equal(err.message, 'nope');
});

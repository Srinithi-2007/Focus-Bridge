'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Organization = require('../src/models/Organization');
const { setTestEmailHook } = require('../src/services/mailer');
const { createOpaqueToken, hashToken } = require('../src/utils/tokens');

let mongod;
let server;
let baseUrl;
const sentEmails = [];

const sleep = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

function startServer(app) {
  return new Promise((resolve) => {
    const s = http.createServer(app);
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      resolve({ s, url: `http://127.0.0.1:${port}` });
    });
  });
}

async function request(path, options = {}) {
  const method = options.method || (options.body ? 'POST' : 'GET');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, headers: res.headers, body };
}

test.before(async () => {
  setTestEmailHook((args) => {
    sentEmails.push(args);
  });

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { autoIndex: true });

  const app = createApp();
  const started = await startServer(app);
  server = started.s;
  baseUrl = started.url;
});

test.after(async () => {
  setTestEmailHook(null);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});

test('Feature 1: Account creation sends welcome email to registered address', async () => {
  sentEmails.length = 0;
  const res = await request('/api/auth/register-organization', {
    body: {
      organizationName: 'Notification Org',
      firstName: 'Samantha',
      lastName: 'Smith',
      email: 'samantha@notify.test',
      password: 'SecurePassword123!',
    },
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.user.email, 'samantha@notify.test');
  await sleep(100);

  // Verify welcome email was dispatched
  const welcomeEmail = sentEmails.find(
    (e) => e.to === 'samantha@notify.test' && e.subject.includes('Welcome to FocusBridge')
  );
  assert.ok(welcomeEmail, 'Welcome email must be sent to newly registered user');
  assert.ok(welcomeEmail.text.includes('Samantha'), 'Email should include user first name');
  assert.ok(welcomeEmail.text.includes('/login'), 'Email should include sign-in link');

  // Duplicate registration must return 409 and NOT send a second welcome email
  const preCount = sentEmails.length;
  const dupRes = await request('/api/auth/register-organization', {
    body: {
      organizationName: 'Duplicate Org',
      firstName: 'Samantha',
      lastName: 'Smith',
      email: 'samantha@notify.test',
      password: 'SecurePassword123!',
    },
  });
  assert.equal(dupRes.status, 409);
  assert.equal(sentEmails.length, preCount, 'No duplicate welcome email on failed registration');
});

test('Feature 2: Sign-in notification sent on success, never on failure', async () => {
  sentEmails.length = 0;

  // 1. Incorrect password -> fails, NO email sent
  const failRes = await request('/api/auth/login', {
    body: { email: 'samantha@notify.test', password: 'WrongPassword123!' },
  });
  assert.equal(failRes.status, 401);
  assert.equal(sentEmails.length, 0, 'No notification sent on bad password');

  // 2. Non-existent email -> fails, NO email sent
  const missingRes = await request('/api/auth/login', {
    body: { email: 'unknown@user.test', password: 'SecurePassword123!' },
  });
  assert.equal(missingRes.status, 401);
  assert.equal(sentEmails.length, 0, 'No notification sent for unknown account');

  // 3. Successful sign-in -> notification sent
  const successRes = await request('/api/auth/login', {
    body: { email: 'samantha@notify.test', password: 'SecurePassword123!' },
  });
  assert.equal(successRes.status, 200);
  await sleep(100);

  const loginEmail = sentEmails.find(
    (e) => e.to === 'samantha@notify.test' && e.subject.includes('New Sign-In')
  );
  assert.ok(loginEmail, 'Sign-in notification must be dispatched on successful login');
  assert.ok(loginEmail.text.includes('FocusBridge'), 'Must mention application name');
  assert.ok(loginEmail.text.includes('Samantha'), 'Must address user by first name');
  assert.ok(!loginEmail.text.includes('SecurePassword123!'), 'Must never include password');
});

test('Feature 3: Forgot password generates 30m single-use token and sends reset email without account enumeration', async () => {
  sentEmails.length = 0;

  // 1. Unknown account -> generic response, no email sent
  const unknownRes = await request('/api/auth/forgot-password', {
    body: { email: 'phantom@nowhere.test' },
  });
  assert.equal(unknownRes.status, 200);
  assert.ok(unknownRes.body.message.includes('If an active account exists'));
  assert.equal(sentEmails.length, 0, 'No email sent for unknown user');

  // 2. Valid account -> generic response, reset email sent
  const validRes = await request('/api/auth/forgot-password', {
    body: { email: 'samantha@notify.test' },
  });
  assert.equal(validRes.status, 200);
  await sleep(100);

  const resetEmail = sentEmails.find(
    (e) => e.to === 'samantha@notify.test' && e.subject.includes('Reset Your FocusBridge Password')
  );
  assert.ok(resetEmail, 'Password reset email must be sent');
  assert.ok(resetEmail.text.includes('30 minutes'), 'Email should state 30 minute expiry');
  assert.ok(resetEmail.text.includes('Samantha'), 'Email should address user');

  // Verify DB state
  const dbUser = await User.findOne({ email: 'samantha@notify.test' }).select(
    '+passwordResetTokenHash +passwordResetExpires'
  );
  assert.ok(dbUser.passwordResetTokenHash, 'Hash must be stored in DB');
  const now = Date.now();
  const maxExpiry = now + 31 * 60 * 1000;
  const minExpiry = now + 28 * 60 * 1000;
  assert.ok(
    dbUser.passwordResetExpires.getTime() <= maxExpiry && dbUser.passwordResetExpires.getTime() >= minExpiry,
    'Reset token expiration must be approximately 30 minutes'
  );
});

test('Feature 4: Validate reset token endpoint rejects invalid/expired and accepts valid tokens', async () => {
  const { raw, hash } = createOpaqueToken();

  // Set active token on user
  await User.updateOne(
    { email: 'samantha@notify.test' },
    {
      passwordResetTokenHash: hash,
      passwordResetExpires: new Date(Date.now() + 15 * 60 * 1000),
    }
  );

  // 1. Valid token -> 200 { valid: true }
  const validCheck = await request('/api/auth/validate-reset-token', {
    body: { token: raw },
  });
  assert.equal(validCheck.status, 200);
  assert.equal(validCheck.body.valid, true);

  // 2. Invalid/random token -> 400
  const invalidCheck = await request('/api/auth/validate-reset-token', {
    body: { token: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' },
  });
  assert.equal(invalidCheck.status, 400);

  // 3. Expired token -> 400
  await User.updateOne(
    { email: 'samantha@notify.test' },
    { passwordResetExpires: new Date(Date.now() - 1000) }
  );
  const expiredCheck = await request('/api/auth/validate-reset-token', {
    body: { token: raw },
  });
  assert.equal(expiredCheck.status, 400);
});

test('Feature 4: Password reset updates password, clears token, and sends confirmation email', async () => {
  sentEmails.length = 0;
  const { raw, hash } = createOpaqueToken();

  await User.updateOne(
    { email: 'samantha@notify.test' },
    {
      passwordResetTokenHash: hash,
      passwordResetExpires: new Date(Date.now() + 30 * 60 * 1000),
    }
  );

  // 1. Weak password rejected
  const weakRes = await request('/api/auth/reset-password', {
    body: { token: raw, password: 'weak' },
  });
  assert.equal(weakRes.status, 400);

  // 2. Strong password accepted
  const resetRes = await request('/api/auth/reset-password', {
    body: { token: raw, password: 'BrandNewSecurePass123!' },
  });
  assert.equal(resetRes.status, 200);
  assert.ok(resetRes.body.message.includes('Password updated'));
  await sleep(100);

  // 3. Confirmation email dispatched
  const confirmEmail = sentEmails.find(
    (e) => e.to === 'samantha@notify.test' && e.subject.includes('Password Has Been Changed')
  );
  assert.ok(confirmEmail, 'Password changed confirmation email must be sent');

  // 4. Token cleared (cannot be reused)
  const dbUser = await User.findOne({ email: 'samantha@notify.test' }).select(
    '+passwordResetTokenHash +passwordResetExpires'
  );
  assert.equal(dbUser.passwordResetTokenHash, undefined, 'Reset token hash must be cleared');

  const reuseRes = await request('/api/auth/reset-password', {
    body: { token: raw, password: 'AnotherNewPass123!' },
  });
  assert.equal(reuseRes.status, 400, 'Reused token must be rejected');

  // 5. Old password fails
  const oldLogin = await request('/api/auth/login', {
    body: { email: 'samantha@notify.test', password: 'SecurePassword123!' },
  });
  assert.equal(oldLogin.status, 401, 'Old password must fail');

  // 6. New password succeeds
  const newLogin = await request('/api/auth/login', {
    body: { email: 'samantha@notify.test', password: 'BrandNewSecurePass123!' },
  });
  assert.equal(newLogin.status, 200, 'New password must succeed');
});

test('Mailer resilience: Email dispatch failures do not abort user operations', async () => {
  // Simulate email provider failure in hook
  setTestEmailHook(() => {
    throw new Error('Simulated upstream email provider timeout');
  });

  const res = await request('/api/auth/register-organization', {
    body: {
      organizationName: 'Resilience Academy',
      firstName: 'Robert',
      lastName: 'Resilient',
      email: 'robert@resilient.test',
      password: 'StrongResiliencePass123!',
    },
  });

  assert.equal(res.status, 201, 'Registration must succeed even if welcome email fails to deliver');
  assert.equal(res.body.user.email, 'robert@resilient.test');
});

test('Public health check: /api/health?check=smtp returns generic status without leaking credentials or diagnostics', async () => {
  const res = await request('/api/health?check=smtp');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.ok(['unconfigured', 'available', 'unavailable'].includes(res.body.smtp));
  // Ensure no sensitive SMTP config or error fields leak to unauthenticated public callers
  assert.equal(res.body.host, undefined);
  assert.equal(res.body.port, undefined);
  assert.equal(res.body.user, undefined);
  assert.equal(res.body.errorCode, undefined);
  assert.equal(res.body.errorMessage, undefined);
});

test('Authenticated SMTP diagnostic: /api/auth/test-smtp verifies connection without sending emails', async () => {
  // 1. Unauthenticated request must be blocked
  const unauthRes = await request('/api/auth/test-smtp');
  assert.equal(unauthRes.status, 401, 'Unauthenticated access to /api/auth/test-smtp must be rejected');

  // 2. Authenticate
  const loginRes = await request('/api/auth/login', {
    body: { email: 'samantha@notify.test', password: 'BrandNewSecurePass123!' },
  });
  assert.equal(loginRes.status, 200);
  const token = loginRes.body.token;

  // Track email count before diagnostic call
  const countBefore = sentEmails.length;

  // 3. Authenticated request succeeds and returns diagnostic details
  const authRes = await request('/api/auth/test-smtp', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(authRes.status, 200);
  assert.equal(authRes.body.status, 'ok');
  assert.ok(typeof authRes.body.smtp === 'object');

  // 4. Verify no email was actually sent
  assert.equal(sentEmails.length, countBefore, '/api/auth/test-smtp must verify connection only, never send emails');
});

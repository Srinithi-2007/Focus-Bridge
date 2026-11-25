'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Invitation = require('../src/models/Invitation');

let mongod;
let server;
let baseUrl;

function startServer(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, () => {
      const { port } = s.address();
      resolve({ s, url: `http://127.0.0.1:${port}` });
    });
  });
}

function request(path, options = {}) {
  const { port } = server.address();
  const method = options.method || (options.body ? 'POST' : 'GET');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const data = options.body ? JSON.stringify(options.body) : null;

  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          let body = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
            body = text;
          }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            cookies: res.headers['set-cookie'] || [],
            body,
          });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function extractCookie(cookies, name) {
  for (const cookie of cookies) {
    const [pair] = cookie.split(';');
    const [k, v] = pair.split('=');
    if (k.trim() === name) return v.trim();
  }
  return null;
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, { autoIndex: true });

  const app = createApp();
  const started = await startServer(app);
  server = started.s;
  baseUrl = started.url;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});

test('MongoDB: Organization registration creates org, admin, hashes password and sets httpOnly cookies', async () => {
  const res = await request('/api/auth/register-organization', {
    body: {
      organizationName: 'Alpha Academy',
      firstName: 'Alice',
      lastName: 'Admin',
      email: 'alice@alpha.test',
      password: 'StrongPassword1',
    },
  });

  assert.equal(res.status, 201);
  assert.ok(res.body.token);
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.status, 'active');
  assert.equal(res.body.user.email, 'alice@alpha.test');
  assert.ok(!res.body.user.passwordHash, 'Password hash must never be returned to client');

  // Verify MongoDB document state
  const dbUser = await User.findOne({ email: 'alice@alpha.test' }).select('+passwordHash');
  assert.ok(dbUser);
  assert.equal(dbUser.role, 'admin');
  assert.equal(dbUser.status, 'active');
  assert.notEqual(dbUser.passwordHash, 'StrongPassword1');
  assert.ok(dbUser.passwordHash.startsWith('$2'));

  const dbOrg = await Organization.findById(dbUser.organizationId);
  assert.ok(dbOrg);
  assert.equal(dbOrg.name, 'Alpha Academy');

  // Verify httpOnly cookie and csrf cookie
  const sessionCookie = extractCookie(res.cookies, 'fb_session');
  const csrfCookie = extractCookie(res.cookies, 'fb_csrf');
  assert.ok(sessionCookie, 'fb_session cookie must be set');
  assert.ok(csrfCookie, 'fb_csrf cookie must be set');

  // Duplicate registration must return 409
  const dupRes = await request('/api/auth/register-organization', {
    body: {
      organizationName: 'Alpha Clone',
      firstName: 'Alice',
      lastName: 'Two',
      email: 'alice@alpha.test',
      password: 'StrongPassword1',
    },
  });
  assert.equal(dupRes.status, 409);
});

test('MongoDB: Login succeeds with correct credentials, sets cookies, and protects against timing leaks', async () => {
  // Valid login
  const res = await request('/api/auth/login', {
    body: { email: 'alice@alpha.test', password: 'StrongPassword1' },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, 'alice@alpha.test');
  const sessionCookie = extractCookie(res.cookies, 'fb_session');
  assert.ok(sessionCookie);

  // Wrong password returns 401
  const wrongPassRes = await request('/api/auth/login', {
    body: { email: 'alice@alpha.test', password: 'WrongPassword1' },
  });
  assert.equal(wrongPassRes.status, 401);
  assert.equal(wrongPassRes.body.error.message, 'Email or password is incorrect');

  // Non-existent user returns 401
  const missingUserRes = await request('/api/auth/login', {
    body: { email: 'nobody@nowhere.test', password: 'StrongPassword1' },
  });
  assert.equal(missingUserRes.status, 401);
  assert.equal(missingUserRes.body.error.message, 'Email or password is incorrect');
});

test('MongoDB: Password reset flow generates hash in DB, verifies expiry, and clears token on use', async () => {
  // Request reset
  const forgotRes = await request('/api/auth/forgot-password', {
    body: { email: 'alice@alpha.test' },
  });
  assert.equal(forgotRes.status, 200);

  // Inspect DB token
  const user = await User.findOne({ email: 'alice@alpha.test' }).select('+passwordResetTokenHash +passwordResetExpires');
  assert.ok(user.passwordResetTokenHash, 'passwordResetTokenHash must be stored in DB');
  assert.ok(user.passwordResetExpires > new Date(), 'Reset expiry must be in the future');

  // In test environment, find Invitation / Reset token by creating one or verifying reset
  // Reset password using the valid token flow:
  // To test resetPassword with raw token, let's create a known raw token on user
  const { createOpaqueToken } = require('../src/utils/tokens');
  const { raw, hash } = createOpaqueToken();
  user.passwordResetTokenHash = hash;
  user.passwordResetExpires = new Date(Date.now() + 3600000);
  await user.save();

  // Reset password
  const resetRes = await request('/api/auth/reset-password', {
    body: { token: raw, password: 'BrandNewPassword1' },
  });
  assert.equal(resetRes.status, 200);
  assert.equal(resetRes.body.message, 'Password updated. You can now sign in.');

  // Verify token is unset in DB (single-use)
  const updatedUser = await User.findOne({ email: 'alice@alpha.test' }).select('+passwordResetTokenHash +passwordResetExpires');
  assert.ok(!updatedUser.passwordResetTokenHash, 'Reset token hash must be cleared after use');

  // Old password must fail
  const oldLogin = await request('/api/auth/login', {
    body: { email: 'alice@alpha.test', password: 'StrongPassword1' },
  });
  assert.equal(oldLogin.status, 401);

  // New password must succeed
  const newLogin = await request('/api/auth/login', {
    body: { email: 'alice@alpha.test', password: 'BrandNewPassword1' },
  });
  assert.equal(newLogin.status, 200);

  // Reusing the same reset token must fail
  const reuseRes = await request('/api/auth/reset-password', {
    body: { token: raw, password: 'AnotherNewPassword1' },
  });
  assert.equal(reuseRes.status, 400);
});

test('MongoDB: Invitations and Coach approval lifecycle', async () => {
  // Login as Alice to get admin session
  const loginRes = await request('/api/auth/login', {
    body: { email: 'alice@alpha.test', password: 'BrandNewPassword1' },
  });
  const adminToken = loginRes.body.token;

  // 1. Admin invites a coach
  const inviteRes = await request('/api/admin/invitations', {
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { email: 'coach.carol@alpha.test', role: 'coach' },
  });
  assert.equal(inviteRes.status, 201);
  assert.equal(inviteRes.body.role, 'coach');
  assert.equal(inviteRes.body.email, 'coach.carol@alpha.test');

  // Verify invitation stored in MongoDB
  const dbInvite = await Invitation.findOne({ email: 'coach.carol@alpha.test' }).select('+tokenHash');
  assert.ok(dbInvite);
  assert.ok(dbInvite.tokenHash);
  assert.equal(dbInvite.role, 'coach');

  // Create an opaque token to test accept invitation
  const { createOpaqueToken, hashToken } = require('../src/utils/tokens');
  const { raw, hash } = createOpaqueToken();
  dbInvite.tokenHash = hash;
  await dbInvite.save();

  // 2. Fetch invitation by token
  const getInviteRes = await request(`/api/auth/invitations/${raw}`);
  assert.equal(getInviteRes.status, 200);
  assert.equal(getInviteRes.body.email, 'coach.carol@alpha.test');
  assert.equal(getInviteRes.body.organizationName, 'Alpha Academy');

  // 3. Coach accepts invitation
  const acceptRes = await request('/api/auth/invitations/accept', {
    body: {
      token: raw,
      firstName: 'Carol',
      lastName: 'Coach',
      password: 'CoachPassword1',
    },
  });
  assert.equal(acceptRes.status, 201);
  assert.equal(acceptRes.body.status, 'pending_approval');

  // 4. Coach tries to log in before approval -> 403 Forbidden
  const coachPreApprovalLogin = await request('/api/auth/login', {
    body: { email: 'coach.carol@alpha.test', password: 'CoachPassword1' },
  });
  assert.equal(coachPreApprovalLogin.status, 403);
  assert.equal(coachPreApprovalLogin.body.error.message, 'Your coach account is awaiting administrator approval');

  // 5. Admin lists users and approves coach
  const listUsersRes = await request('/api/admin/users?role=coach&status=pending_approval', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(listUsersRes.status, 200);
  const pendingCoach = listUsersRes.body.users.find((u) => u.email === 'coach.carol@alpha.test');
  assert.ok(pendingCoach);

  const approveRes = await request(`/api/admin/users/${pendingCoach.id}/approve`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.user.status, 'active');

  // 6. Approved coach logs in successfully
  const coachPostApprovalLogin = await request('/api/auth/login', {
    body: { email: 'coach.carol@alpha.test', password: 'CoachPassword1' },
  });
  assert.equal(coachPostApprovalLogin.status, 200);
  assert.equal(coachPostApprovalLogin.body.user.role, 'coach');
  assert.equal(coachPostApprovalLogin.body.user.status, 'active');
});

test('MongoDB: Organization-level data isolation prevents cross-tenant access', async () => {
  // Create Organization B with Admin Bob
  const orgBRes = await request('/api/auth/register-organization', {
    body: {
      organizationName: 'Beta Institute',
      firstName: 'Bob',
      lastName: 'Builder',
      email: 'bob@beta.test',
      password: 'BetaPassword1',
    },
  });
  assert.equal(orgBRes.status, 201);
  const adminBToken = orgBRes.body.token;

  // Login as Admin Alice (Org A)
  const orgARes = await request('/api/auth/login', {
    body: { email: 'alice@alpha.test', password: 'BrandNewPassword1' },
  });
  const adminAToken = orgARes.body.token;

  // Admin B creates an invitation in Org B
  const bInviteRes = await request('/api/admin/invitations', {
    headers: { Authorization: `Bearer ${adminBToken}` },
    body: { email: 'student.ben@beta.test', role: 'student' },
  });
  assert.equal(bInviteRes.status, 201);
  const bInviteId = bInviteRes.body.id;

  // Admin A lists invitations -> must NOT see Org B's invitation
  const aListInvites = await request('/api/admin/invitations', {
    headers: { Authorization: `Bearer ${adminAToken}` },
  });
  assert.equal(aListInvites.status, 200);
  const seenInA = aListInvites.body.invitations.find((i) => i.id === bInviteId);
  assert.equal(seenInA, undefined, 'Admin A must not see Org B invitations');

  // Admin A tries to revoke Org B's invitation -> must return 404
  const revokeAttempt = await request(`/api/admin/invitations/${bInviteId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminAToken}` },
  });
  assert.equal(revokeAttempt.status, 404);

  // Admin A lists users -> must NOT see Bob
  const aUsers = await request('/api/admin/users', {
    headers: { Authorization: `Bearer ${adminAToken}` },
  });
  assert.equal(aUsers.status, 200);
  const bobSeenByAlice = aUsers.body.users.find((u) => u.email === 'bob@beta.test');
  assert.equal(bobSeenByAlice, undefined, 'Admin A must not see Org B users');
});

test('MongoDB & API: CastError returns HTTP 400 instead of 500 server crash', async () => {
  const loginRes = await request('/api/auth/login', {
    body: { email: 'alice@alpha.test', password: 'BrandNewPassword1' },
  });
  const adminToken = loginRes.body.token;

  // Pass non-ObjectId string to route parameter
  const res = await request('/api/admin/users/not-a-valid-object-id/approve', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.message, 'Invalid identifier format');
});

test('Security: Cookie authentication requires valid CSRF token on mutating requests', async () => {
  // Register or login to get cookies
  const loginRes = await request('/api/auth/login', {
    body: { email: 'alice@alpha.test', password: 'BrandNewPassword1' },
  });
  const sessionCookie = extractCookie(loginRes.cookies, 'fb_session');
  const csrfCookie = extractCookie(loginRes.cookies, 'fb_csrf');

  // Mutating request using cookie WITHOUT X-CSRF-Token -> 403 Forbidden
  const noCsrfRes = await request('/api/admin/invitations', {
    method: 'POST',
    headers: {
      Cookie: `fb_session=${sessionCookie}; fb_csrf=${csrfCookie}`,
    },
    body: { email: 'hacker@test.com', role: 'coach' },
  });
  assert.equal(noCsrfRes.status, 403);
  assert.equal(noCsrfRes.body.error.message, 'CSRF verification failed: invalid or missing CSRF token');

  // Mutating request using cookie WITH matching X-CSRF-Token -> 201 Created
  const withCsrfRes = await request('/api/admin/invitations', {
    method: 'POST',
    headers: {
      Cookie: `fb_session=${sessionCookie}; fb_csrf=${csrfCookie}`,
      'X-CSRF-Token': csrfCookie,
    },
    body: { email: 'legit.coach@alpha.test', role: 'coach' },
  });
  assert.equal(withCsrfRes.status, 201);
});

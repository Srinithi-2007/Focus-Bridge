'use strict';
// MongoDB-backed tests for Phase 2 admin workflows.
// Connects to an isolated in-memory MongoDB instance (or MONGODB_TEST_URI if provided).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let server;
let base;

async function call(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path, headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        let parsed = text;
        try { parsed = text ? JSON.parse(text) : null; } catch { /* csv */ }
        resolve({ status: res.statusCode, body: parsed, text });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function makeOrg(name) {
  const Organization = require('../src/models/Organization');
  const org = await Organization.create({ name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
  return org;
}

async function makeUser(org, { role, status = 'active', email, coachId = null, programId = null, firstName = 'T', lastName = 'User' }) {
  const User = require('../src/models/User');
  const { signSessionToken } = require('../src/services/tokenService');
  const user = await User.create({ organizationId: org._id, email, role, status, coachId, programId, firstName, lastName });
  return { user, token: signSessionToken(user) };
}

test.before(async () => {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }
  await mongoose.connect(uri);

  const { createApp } = require('../src/app');
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('admin routes reject unauthenticated and non-admin users', async () => {
  const org = await makeOrg('Guard Org');
  const coach = await makeUser(org, { role: 'coach', email: 'guard-coach@x.test' });
  const student = await makeUser(org, { role: 'student', email: 'guard-student@x.test' });
  assert.equal((await call('GET', '/api/admin/dashboard')).status, 401);
  assert.equal((await call('GET', '/api/admin/dashboard', coach.token)).status, 403);
  assert.equal((await call('GET', '/api/admin/students', student.token)).status, 403);
  assert.equal((await call('GET', '/api/admin/reports', coach.token)).status, 403);
});

test('coach approval moves pending_approval to active and is org-scoped', async () => {
  const orgA = await makeOrg('Approve A');
  const orgB = await makeOrg('Approve B');
  const adminA = await makeUser(orgA, { role: 'admin', email: 'adminA@x.test' });
  const pendingA = await makeUser(orgA, { role: 'coach', status: 'pending_approval', email: 'pendingA@x.test' });
  const pendingB = await makeUser(orgB, { role: 'coach', status: 'pending_approval', email: 'pendingB@x.test' });

  const other = await call('PATCH', `/api/admin/users/${pendingB.user._id}/approve`, adminA.token);
  assert.equal(other.status, 404, 'admin of org A cannot approve org B coach');

  const ok = await call('PATCH', `/api/admin/users/${pendingA.user._id}/approve`, adminA.token);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.status, 'active');
});

test('duplicate open invitations are rejected; revoke allows a new one', async () => {
  const org = await makeOrg('Invite Org');
  const admin = await makeUser(org, { role: 'admin', email: 'inviteadmin@x.test' });
  const first = await call('POST', '/api/admin/invitations', admin.token, { email: 'new.student@x.test', role: 'student' });
  assert.equal(first.status, 201);
  const dup = await call('POST', '/api/admin/invitations', admin.token, { email: 'new.student@x.test', role: 'student' });
  assert.equal(dup.status, 409);
  assert.equal((await call('DELETE', `/api/admin/invitations/${first.body.id}`, admin.token)).status, 200);
  assert.equal((await call('POST', '/api/admin/invitations', admin.token, { email: 'new.student@x.test', role: 'student' })).status, 201);
});

test('coach allocation accepts active coaches only and blocks other organizations', async () => {
  const orgA = await makeOrg('Alloc A');
  const orgB = await makeOrg('Alloc B');
  const admin = await makeUser(orgA, { role: 'admin', email: 'allocadmin@x.test' });
  const coach = await makeUser(orgA, { role: 'coach', email: 'allocacoach@x.test' });
  const pending = await makeUser(orgA, { role: 'coach', status: 'pending_approval', email: 'allocpending@x.test' });
  const student = await makeUser(orgA, { role: 'student', email: 'allocstudent@x.test' });
  const foreignCoach = await makeUser(orgB, { role: 'coach', email: 'foreigncoach@x.test' });

  assert.equal((await call('PUT', `/api/admin/students/${student.user._id}/coach`, admin.token, { coachId: pending.user._id.toString() })).status, 400);
  assert.equal((await call('PUT', `/api/admin/students/${student.user._id}/coach`, admin.token, { coachId: foreignCoach.user._id.toString() })).status, 400);
  const ok = await call('PUT', `/api/admin/students/${student.user._id}/coach`, admin.token, { coachId: coach.user._id.toString() });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.coachId, coach.user._id.toString());
});

test('groups: assign coach, add students without duplicates, remove members', async () => {
  const org = await makeOrg('Group Org');
  const admin = await makeUser(org, { role: 'admin', email: 'groupadmin@x.test' });
  const coach = await makeUser(org, { role: 'coach', email: 'groupcoach@x.test' });
  const s1 = await makeUser(org, { role: 'student', email: 'g1@x.test' });
  const s2 = await makeUser(org, { role: 'student', status: 'deactivated', email: 'g2@x.test' });

  const created = await call('POST', '/api/admin/groups', admin.token, { name: 'Morning Cohort', coachId: coach.user._id.toString() });
  assert.equal(created.status, 201);
  const gid = created.body.group.id;

  const bad = await call('POST', `/api/admin/groups/${gid}/members`, admin.token, { studentIds: [s2.user._id.toString()] });
  assert.equal(bad.status, 400, 'deactivated students cannot be added');

  const added = await call('POST', `/api/admin/groups/${gid}/members`, admin.token, { studentIds: [s1.user._id.toString()] });
  assert.equal(added.body.added, 1);
  const again = await call('POST', `/api/admin/groups/${gid}/members`, admin.token, { studentIds: [s1.user._id.toString()] });
  assert.equal(again.body.added, 0);
  assert.equal(again.body.skipped, 1);

  const removed = await call('DELETE', `/api/admin/groups/${gid}/members/${s1.user._id}`, admin.token);
  assert.equal(removed.body.group.memberCount, 0);
});

test('programs cannot be deleted while in use', async () => {
  const org = await makeOrg('Program Org');
  const admin = await makeUser(org, { role: 'admin', email: 'progadmin@x.test' });
  const prog = await call('POST', '/api/admin/programs', admin.token, { name: 'Focus Track', coachingAreas: ['Planning'] });
  assert.equal(prog.status, 201);
  const pid = prog.body.program.id;
  await makeUser(org, { role: 'student', email: 'prog-student@x.test', programId: new mongoose.Types.ObjectId(pid) });
  const del = await call('DELETE', `/api/admin/programs/${pid}`, admin.token);
  assert.equal(del.status, 409);
});

test('reports are org-scoped and CSV export neutralizes formulas', async () => {
  const orgA = await makeOrg('Report A');
  const orgB = await makeOrg('Report B');
  const adminA = await makeUser(orgA, { role: 'admin', email: 'repA@x.test' });
  await makeUser(orgB, { role: 'student', email: 'repB-student@x.test', firstName: '=EVIL()' });
  await makeUser(orgA, { role: 'student', email: 'repA-student@x.test', firstName: 'Ana' });

  const report = await call('GET', '/api/admin/reports', adminA.token);
  assert.equal(report.status, 200);
  assert.equal(report.body.report.students.active, 1, 'org B students are not counted');

  const csv = await call('GET', '/api/admin/reports/export?type=students', adminA.token);
  assert.equal(csv.status, 200);
  assert.ok(!csv.text.includes('EVIL'), 'org B data must not appear');
});

test('settings: admin can update, invalid expiry rejected', async () => {
  const org = await makeOrg('Settings Org');
  const admin = await makeUser(org, { role: 'admin', email: 'setadmin@x.test' });
  const ok = await call('PATCH', '/api/admin/settings', admin.token, { invitations: { expiryDays: 14 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.settings.invitations.expiryDays, 14);
  assert.equal((await call('PATCH', '/api/admin/settings', admin.token, { invitations: { expiryDays: 999 } })).status, 400);
});

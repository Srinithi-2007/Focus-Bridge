'use strict';
// MongoDB-backed Phase 3 tests: coach authorization, allocation boundaries, tasks, reviews,
// activities, groups, cookie+CSRF auth, and organization isolation.
// Uses MONGODB_TEST_URI if provided, otherwise starts an isolated in-memory MongoMemoryServer.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

let mongod;
let server;
let models;
let signSessionToken;
let hashPassword;

function call(method, path, token, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json', ...extraHeaders };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path, headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        let parsed = text;
        try { parsed = text ? JSON.parse(text) : null; } catch { /* non-json */ }
        resolve({ status: res.statusCode, body: parsed, text, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function org(name) {
  return models.Organization.create({ name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${Math.random().toString(36).slice(2, 8)}` });
}

async function person(o, { role, email, status = 'active', coachId = null, firstName = 'T', lastName = 'U', passwordHash }) {
  const user = await models.User.create({ organizationId: o._id, email, role, status, coachId, firstName, lastName, ...(passwordHash ? { passwordHash } : {}) });
  return { user, token: signSessionToken(user), id: String(user._id) };
}

// Shared fixture: org A has coach A (with student1 and group GA) and coach A2 (no students); org B has coach B and student B1.
async function fixture(label) {
  const A = await org(`${label} A`);
  const B = await org(`${label} B`);
  const admin = await person(A, { role: 'admin', email: `${label}-admin@x.test` });
  const coachA = await person(A, { role: 'coach', email: `${label}-coachA@x.test` });
  const coachA2 = await person(A, { role: 'coach', email: `${label}-coachA2@x.test` });
  const student1 = await person(A, { role: 'student', email: `${label}-s1@x.test`, coachId: coachA.user._id, firstName: 'Alex' });
  const student2 = await person(A, { role: 'student', email: `${label}-s2@x.test`, coachId: coachA2.user._id, firstName: 'Maya' });
  const coachB = await person(B, { role: 'coach', email: `${label}-coachB@x.test` });
  const studentB = await person(B, { role: 'student', email: `${label}-sb@x.test`, coachId: coachB.user._id });
  const group = await models.Group.create({ organizationId: A._id, name: `${label} Group A`, coachId: coachA.user._id, memberIds: [student1.user._id] });
  return { A, B, admin, coachA, coachA2, student1, student2, coachB, studentB, group };
}

test.before(async () => {
  let uri = process.env.MONGODB_TEST_URI;
  if (!uri) {
    mongod = await MongoMemoryServer.create();
    uri = mongod.getUri();
  }
  await mongoose.connect(uri);
  await mongoose.connection.db.dropDatabase();
  const { createApp } = require('../src/app');
  signSessionToken = require('../src/services/tokenService').signSessionToken;
  hashPassword = require('../src/utils/password').hashPassword;
  models = {
    Organization: require('../src/models/Organization'),
    User: require('../src/models/User'),
    Group: require('../src/models/Group'),
    Review: require('../src/models/Review'),
  };
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('coach routes reject anonymous, admin and student callers', async () => {
  const f = await fixture('authz');
  assert.equal((await call('GET', '/api/coach/dashboard')).status, 401);
  assert.equal((await call('GET', '/api/coach/dashboard', f.admin.token)).status, 403);
  assert.equal((await call('GET', '/api/coach/students', f.student1.token)).status, 403);
  assert.equal((await call('GET', '/api/me/tasks', f.coachA.token)).status, 403);
});

test('coach sees only allocated students; other coaches get 404 for them', async () => {
  const f = await fixture('alloc');
  const list = await call('GET', '/api/coach/students', f.coachA.token);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.students.map((s) => s.id), [f.student1.id]);
  assert.equal((await call('GET', `/api/coach/students/${f.student2.id}`, f.coachA.token)).status, 404);
  assert.equal((await call('GET', `/api/coach/students/${f.student1.id}`, f.coachA.token)).status, 200);
});

test('a coach cannot assign a task to a student allocated to someone else', async () => {
  const f = await fixture('taskassign');
  const r = await call('POST', '/api/coach/tasks', f.coachA.token, {
    title: 'Plan the week', instructions: 'Write a weekly plan with three goals.', audience: 'student', studentId: f.student2.id, publish: true,
  });
  assert.equal(r.status, 404);
});

test('publishing preserves original instructions and deadline; edits are recorded as revisions', async () => {
  const f = await fixture('revise');
  const created = await call('POST', '/api/coach/tasks', f.coachA.token, {
    title: 'Reading log', instructions: 'Log three chapters with a summary.', audience: 'student', studentId: f.student1.id, deadline: iso(3 * DAY), publish: true,
  });
  assert.equal(created.status, 201);
  const id = created.body.task.id;
  assert.equal(created.body.task.status, 'published');

  const edited = await call('PATCH', `/api/coach/tasks/${id}`, f.coachA.token, { instructions: 'Log five chapters with a summary.' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.task.revisionCount, 1);
  assert.equal(edited.body.task.originalInstructions, 'Log three chapters with a summary.');

  const retarget = await call('PATCH', `/api/coach/tasks/${id}`, f.coachA.token, { studentId: f.student2.id });
  assert.equal(retarget.status, 409);
});

test('invalid publish is rejected; archived tasks cannot be edited', async () => {
  const f = await fixture('publish');
  const bad = await call('POST', '/api/coach/tasks', f.coachA.token, { title: 'Short', instructions: 'tiny', audience: 'student', studentId: f.student1.id, publish: true });
  assert.equal(bad.status, 400);
  const draft = await call('POST', '/api/coach/tasks', f.coachA.token, { title: 'Essay', instructions: 'Write an essay about focus habits.', audience: 'student', studentId: f.student1.id });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.task.status, 'draft');
  const pub = await call('POST', `/api/coach/tasks/${draft.body.task.id}/publish`, f.coachA.token);
  assert.equal(pub.status, 200);
  assert.equal((await call('POST', `/api/coach/tasks/${draft.body.task.id}/archive`, f.coachA.token)).status, 200);
  assert.equal((await call('PATCH', `/api/coach/tasks/${draft.body.task.id}`, f.coachA.token, { title: 'Changed title' })).status, 409);
});

test('group tasks: only the owning coach can target the group; members receive the task', async () => {
  const f = await fixture('grouptask');
  const other = await call('POST', '/api/coach/tasks', f.coachB.token, { title: 'Group work', instructions: 'Discuss the reading in pairs.', audience: 'group', groupId: String(f.group._id), publish: true });
  assert.equal(other.status, 404);
  const own = await call('POST', '/api/coach/tasks', f.coachA.token, { title: 'Group work', instructions: 'Discuss the reading in pairs.', audience: 'group', groupId: String(f.group._id), publish: true });
  assert.equal(own.status, 201);
  const mine = await call('GET', '/api/me/tasks', f.student1.token);
  assert.equal(mine.status, 200);
  assert.ok(mine.body.tasks.some((t) => t.id === own.body.task.id));
});

test('groups: other coaches cannot read or post in a group they do not own', async () => {
  const f = await fixture('groups');
  assert.equal((await call('GET', `/api/coach/groups/${f.group._id}`, f.coachB.token)).status, 404);
  assert.equal((await call('POST', `/api/coach/groups/${f.group._id}/posts`, f.coachB.token, { kind: 'announcement', body: 'Hello from elsewhere' })).status, 404);
  const ok = await call('POST', `/api/coach/groups/${f.group._id}/posts`, f.coachA.token, { kind: 'announcement', body: 'Welcome to the cohort' });
  assert.equal(ok.status, 201);
  const reply = await call('POST', `/api/coach/groups/${f.group._id}/posts`, f.coachA.token, { kind: 'discussion', body: 'Reply to welcome', parentId: ok.body.post.id });
  assert.equal(reply.status, 201);
  const nested = await call('POST', `/api/coach/groups/${f.group._id}/posts`, f.coachA.token, { kind: 'discussion', body: 'Reply to reply', parentId: reply.body.post.id });
  assert.equal(nested.status, 400);
});

test('student submits to an assigned task; unassigned students and other coaches are refused', async () => {
  const f = await fixture('submit');
  const t = await call('POST', '/api/coach/tasks', f.coachA.token, { title: 'Journal entry', instructions: 'Write a short journal entry.', audience: 'student', studentId: f.student1.id, publish: true });
  const taskId = t.body.task.id;
  assert.equal((await call('POST', `/api/me/tasks/${taskId}/submission`, f.student2.token, { body: 'Hi' })).status, 404);
  const sub = await call('POST', `/api/me/tasks/${taskId}/submission`, f.student1.token, { body: 'Today I wrote about focus.' });
  assert.equal(sub.status, 201);
  const submissionId = sub.body.submission.id;
  assert.equal((await call('POST', `/api/coach/submissions/${submissionId}/feedback`, f.coachB.token, { feedback: 'Nice' })).status, 404);
  const fb = await call('POST', `/api/coach/submissions/${submissionId}/feedback`, f.coachA.token, { feedback: 'Good detail, keep going.' });
  assert.equal(fb.status, 200);
  assert.equal(fb.body.submission.status, 'reviewed');
});

test('reviews: drafts editable, submission requires core sections, submitted reviews are locked', async () => {
  const f = await fixture('reviews');
  assert.equal((await call('POST', '/api/coach/reviews', f.coachA.token, { studentId: f.student2.id, strengths: 'x' })).status, 404);
  const draft = await call('POST', '/api/coach/reviews', f.coachA.token, { studentId: f.student1.id, strengths: 'Consistent effort' });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.review.status, 'draft');
  const incomplete = await call('PATCH', `/api/coach/reviews/${draft.body.review.id}`, f.coachA.token, { submit: true });
  assert.equal(incomplete.status, 400);
  const complete = await call('PATCH', `/api/coach/reviews/${draft.body.review.id}`, f.coachA.token, { observations: 'Plans ahead', nextGoals: 'Add a weekly review', submit: true });
  assert.equal(complete.status, 200);
  assert.equal(complete.body.review.status, 'submitted');
  assert.equal((await call('PATCH', `/api/coach/reviews/${draft.body.review.id}`, f.coachA.token, { strengths: 'Changed later' })).status, 409);
  const list = await call('GET', `/api/coach/reviews?studentId=${f.student1.id}`, f.coachA.token);
  assert.equal(list.body.reviews.length, 1);
});

test('private coach notes are not visible to other coaches or any student endpoint', async () => {
  const f = await fixture('notes');
  const note = await call('POST', `/api/coach/students/${f.student1.id}/notes`, f.coachA.token, { body: 'Private: prefers morning sessions' });
  assert.equal(note.status, 201);
  const profile = await call('GET', `/api/coach/students/${f.student1.id}`, f.coachA.token);
  assert.equal(profile.body.privateNotes.length, 1);
  assert.equal((await call('GET', `/api/coach/students/${f.student1.id}`, f.coachA2.token)).status, 404);
  const mine = await call('GET', '/api/me/tasks', f.student1.token);
  assert.ok(!mine.text.includes('prefers morning'));
});

test('activities: schedule in the future, complete only after start, cancel only when scheduled', async () => {
  const f = await fixture('activities');
  const past = await call('POST', '/api/coach/activities', f.coachA.token, { groupId: String(f.group._id), title: 'Old session', startsAt: iso(-DAY), endsAt: iso(-DAY + 3600000) });
  assert.equal(past.status, 400);
  const future = await call('POST', '/api/coach/activities', f.coachA.token, { groupId: String(f.group._id), title: 'Focus circle', startsAt: iso(2 * DAY), endsAt: iso(2 * DAY + 3600000) });
  assert.equal(future.status, 201);
  assert.equal((await call('POST', `/api/coach/activities/${future.body.activity.id}/complete`, f.coachA.token)).status, 409);
  assert.equal((await call('POST', `/api/coach/activities/${future.body.activity.id}/cancel`, f.coachA.token)).status, 200);
  assert.equal((await call('POST', `/api/coach/activities/${future.body.activity.id}/cancel`, f.coachA.token)).status, 409);
  assert.equal((await call('POST', '/api/coach/activities', f.coachB.token, { groupId: String(f.group._id), title: 'Stolen', startsAt: iso(DAY), endsAt: iso(DAY + 3600000) })).status, 404);
});

test('organization isolation: a coach in another organization sees nothing from this one', async () => {
  const f = await fixture('isolation');
  const dash = await call('GET', '/api/coach/dashboard', f.coachB.token);
  assert.equal(dash.status, 200);
  assert.equal(dash.body.metrics.assignedStudents, 1);
  assert.equal(dash.body.roster[0].id, f.studentB.id);
  assert.equal((await call('GET', `/api/coach/groups/${f.group._id}`, f.coachB.token)).status, 404);
  assert.equal((await call('GET', `/api/coach/students/${f.student1.id}`, f.coachB.token)).status, 404);
});

test('coach reports count only the coach\'s allocated students and export is CSV', async () => {
  const f = await fixture('reports');
  const report = await call('GET', '/api/coach/reports?from=2026-01-01&to=2026-12-31', f.coachA.token);
  assert.equal(report.status, 200);
  assert.equal(report.body.report.summary.students, 1);
  const csv = await call('GET', '/api/coach/reports/export?type=students&from=2026-01-01&to=2026-12-31', f.coachA.token);
  assert.equal(csv.status, 200);
  assert.ok(!csv.text.includes('Maya'));
  assert.equal((await call('GET', `/api/coach/reports/export?type=activities&groupId=${f.group._id}`, f.coachB.token)).status, 404);
});

test('coach httpOnly cookie authentication works and enforces CSRF on mutations', async () => {
  const o = await org('CookieCoachOrg');
  const passwordHash = await hashPassword('CoachSecret123');
  const coach = await person(o, { role: 'coach', email: 'cookie-coach@x.test', passwordHash });
  const student = await person(o, { role: 'student', email: 'cookie-student@x.test', coachId: coach.user._id });

  const login = await call('POST', '/api/auth/login', null, { email: 'cookie-coach@x.test', password: 'CoachSecret123' });
  assert.equal(login.status, 200);
  const setCookies = login.headers['set-cookie'] || [];
  const sessionRaw = setCookies.find((c) => c.startsWith('fb_session='));
  const csrfRaw = setCookies.find((c) => c.startsWith('fb_csrf='));
  assert.ok(sessionRaw && sessionRaw.toLowerCase().includes('httponly'), 'fb_session cookie must be httpOnly');
  assert.ok(csrfRaw, 'fb_csrf cookie must be set');

  const sessionPair = sessionRaw.split(';')[0];
  const csrfPair = csrfRaw.split(';')[0];
  const csrfToken = csrfPair.split('=')[1];
  const cookieHeader = `${sessionPair}; ${csrfPair}`;

  // GET succeeds using httpOnly cookie alone (no Bearer token)
  const dash = await call('GET', '/api/coach/dashboard', null, null, { Cookie: cookieHeader });
  assert.equal(dash.status, 200);
  assert.equal(dash.body.metrics.assignedStudents, 1);

  // POST without X-CSRF-Token is rejected with 403
  const blocked = await call('POST', '/api/coach/tasks', null, {
    title: 'Blocked task', instructions: 'Should fail without CSRF header.', audience: 'student', studentId: student.id,
  }, { Cookie: cookieHeader });
  assert.equal(blocked.status, 403);

  // POST with valid X-CSRF-Token succeeds
  const allowed = await call('POST', '/api/coach/tasks', null, {
    title: 'Allowed task', instructions: 'Should pass with valid CSRF header.', audience: 'student', studentId: student.id,
  }, { Cookie: cookieHeader, 'X-CSRF-Token': csrfToken });
  assert.equal(allowed.status, 201);
});

test('Phase 1 and Phase 2 regression: admin dashboard still answers for administrators', async () => {
  const f = await fixture('regress');
  assert.equal((await call('GET', '/api/admin/dashboard', f.admin.token)).status, 200);
  assert.equal((await call('GET', '/api/admin/students', f.admin.token)).status, 200);
});

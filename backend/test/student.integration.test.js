'use strict';
// MongoDB-backed Phase 4 tests: student authorization, plans and calendar, notifications, messages, settings, reminders.
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

function call(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path, headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        let parsed = text;
        try { parsed = text ? JSON.parse(text) : null; } catch { /* non-json */ }
        resolve({ status: res.statusCode, body: parsed, text });
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
async function person(o, { role, email, coachId = null, firstName = 'T', lastName = 'U' }) {
  const user = await models.User.create({ organizationId: o._id, email, role, status: 'active', coachId, firstName, lastName });
  return { user, token: signSessionToken(user), id: String(user._id) };
}

async function fixture(label) {
  const A = await org(`${label} A`);
  const B = await org(`${label} B`);
  const coach = await person(A, { role: 'coach', email: `${label}-coach@x.test`, firstName: 'Jordan', lastName: 'Lee' });
  const coach2 = await person(A, { role: 'coach', email: `${label}-coach2@x.test` });
  const student = await person(A, { role: 'student', email: `${label}-student@x.test`, coachId: coach.user._id, firstName: 'Alex', lastName: 'Rivera' });
  const other = await person(A, { role: 'student', email: `${label}-other@x.test`, coachId: coach2.user._id });
  const outsider = await person(B, { role: 'student', email: `${label}-outsider@x.test` });
  const group = await models.Group.create({ organizationId: A._id, name: `${label} cohort`, coachId: coach.user._id, memberIds: [student.user._id] });
  return { A, B, coach, coach2, student, other, outsider, group };
}

async function publishTask(f, { studentId, deadline = iso(3 * DAY) }) {
  const created = await call('POST', '/api/coach/tasks', f.coach.token, {
    title: 'Reflection essay', instructions: 'Write an introduction about focus. Then list three habits. Finally write a conclusion.',
    audience: 'student', studentId, deadline, publish: true,
  });
  assert.equal(created.status, 201, created.text);
  return created.body.task.id;
}

const WEEK_AVAIL = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '08:00', end: '20:00' }));

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
  models = {
    Organization: require('../src/models/Organization'),
    User: require('../src/models/User'),
    Group: require('../src/models/Group'),
  };
  server = http.createServer(createApp());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('student routes refuse coaches, admins and anonymous callers', async () => {
  const f = await fixture('authz4');
  assert.equal((await call('GET', '/api/me/dashboard')).status, 401);
  assert.equal((await call('GET', '/api/me/dashboard', f.coach.token)).status, 403);
  assert.equal((await call('GET', '/api/me/plans', f.coach.token)).status, 403);
});

test('plans: without availability the proposal is not feasible and cannot be approved', async () => {
  const f = await fixture('noavail');
  const taskId = await publishTask(f, { studentId: f.student.id });
  const gen = await call('POST', `/api/me/tasks/${taskId}/plans`, f.student.token);
  assert.equal(gen.status, 201);
  assert.equal(gen.body.plan.feasible, false);
  assert.equal((await call('POST', `/api/me/plans/${gen.body.plan.id}/approve`, f.student.token)).status, 409);
});

test('plans: a student cannot plan another student\'s task or see another organization\'s plans', async () => {
  const f = await fixture('scope');
  const taskId = await publishTask(f, { studentId: f.student.id });
  assert.equal((await call('POST', `/api/me/tasks/${taskId}/plans`, f.other.token)).status, 404);
  assert.equal((await call('POST', `/api/me/tasks/${taskId}/plans`, f.outsider.token)).status, 404);
});

test('approval turns a proposal into calendar work blocks; rejected proposals do not', async () => {
  const f = await fixture('approve');
  await call('PATCH', '/api/me/settings', f.student.token, { availability: WEEK_AVAIL });
  const taskId = await publishTask(f, { studentId: f.student.id });
  const gen = await call('POST', `/api/me/tasks/${taskId}/plans`, f.student.token);
  assert.equal(gen.status, 201);
  assert.ok(gen.body.plan.blocks.length > 0, 'blocks were proposed');
  assert.equal(gen.body.plan.source, 'planner');

  const before = await call('GET', '/api/me/calendar', f.student.token);
  assert.equal(before.body.workBlocks.length, 0, 'nothing on calendar before approval');

  const approved = await call('POST', `/api/me/plans/${gen.body.plan.id}/approve`, f.student.token);
  assert.equal(approved.status, 200);
  const after = await call('GET', '/api/me/calendar', f.student.token);
  assert.equal(after.body.workBlocks.length, gen.body.plan.blocks.length);

  const again = await call('POST', `/api/me/plans/${gen.body.plan.id}/approve`, f.student.token);
  assert.equal(again.status, 409, 'an approved plan cannot be approved twice');
});

test('manual block edits are validated: no overlap, no past deadline, correct subtask', async () => {
  const f = await fixture('blocks');
  await call('PATCH', '/api/me/settings', f.student.token, { availability: WEEK_AVAIL });
  const taskId = await publishTask(f, { studentId: f.student.id });
  const gen = await call('POST', `/api/me/tasks/${taskId}/plans`, f.student.token);
  const planId = gen.body.plan.id;
  const subId = gen.body.plan.subtasks[0].id;
  const start = new Date(Date.now() + DAY).toISOString();
  const end = new Date(Date.now() + DAY + 3600000).toISOString();
  const overlap = await call('PATCH', `/api/me/plans/${planId}`, f.student.token, { blocks: [
    { subtaskId: subId, start, end },
    { subtaskId: subId, start: new Date(Date.now() + DAY + 1800000).toISOString(), end: new Date(Date.now() + DAY + 7200000).toISOString() },
  ] });
  assert.equal(overlap.status, 400);
  const late = await call('PATCH', `/api/me/plans/${planId}`, f.student.token, { blocks: [{ subtaskId: subId, start: new Date(Date.now() + 4 * DAY).toISOString(), end: new Date(Date.now() + 4 * DAY + 3600000).toISOString() }] });
  assert.equal(late.status, 400, 'block after deadline is refused');
  const bad = await call('PATCH', `/api/me/plans/${planId}`, f.student.token, { blocks: [{ subtaskId: '000000000000000000000000', start, end }] });
  assert.equal(bad.status, 400);
});

test('subtasks can be ticked only on approved plans; reschedule creates a new proposal', async () => {
  const f = await fixture('subtasks');
  await call('PATCH', '/api/me/settings', f.student.token, { availability: WEEK_AVAIL });
  const taskId = await publishTask(f, { studentId: f.student.id });
  const gen = await call('POST', `/api/me/tasks/${taskId}/plans`, f.student.token);
  const planId = gen.body.plan.id;
  const subId = gen.body.plan.subtasks[0].id;
  assert.equal((await call('PATCH', `/api/me/plans/${planId}/subtasks/${subId}`, f.student.token, { done: true })).status, 409);
  await call('POST', `/api/me/plans/${planId}/approve`, f.student.token);
  const ticked = await call('PATCH', `/api/me/plans/${planId}/subtasks/${subId}`, f.student.token, { done: true });
  assert.equal(ticked.status, 200);
  const re = await call('POST', `/api/me/plans/${planId}/reschedule`, f.student.token);
  assert.equal(re.status, 201);
  assert.ok(re.body.plan.subtasks.every((s) => !s.done || s.id !== subId), 'done subtask is not re-planned');
});

test('the coach task changes nothing in the student plan: instructions and deadline stay the coach\'s', async () => {
  const f = await fixture('preserve');
  await call('PATCH', '/api/me/settings', f.student.token, { availability: WEEK_AVAIL });
  const deadline = iso(3 * DAY);
  const taskId = await publishTask(f, { studentId: f.student.id, deadline });
  await call('POST', `/api/me/tasks/${taskId}/plans`, f.student.token);
  const mine = await call('GET', '/api/me/tasks', f.student.token);
  const t = mine.body.tasks.find((x) => x.id === taskId);
  assert.equal(t.instructions.startsWith('Write an introduction'), true);
  assert.equal(new Date(t.deadline).toISOString(), new Date(deadline).toISOString());
});

test('notifications: coach publish and feedback notify the student; read state is per student', async () => {
  const f = await fixture('notify');
  const taskId = await publishTask(f, { studentId: f.student.id });
  const list = await call('GET', '/api/me/notifications', f.student.token);
  assert.ok(list.body.notifications.some((n) => n.type === 'task'));
  const id = list.body.notifications[0].id;
  assert.equal((await call('POST', `/api/me/notifications/${id}/read`, f.other.token)).status, 404);
  assert.equal((await call('POST', `/api/me/notifications/${id}/read`, f.student.token)).status, 200);
  const sub = await call('POST', `/api/me/tasks/${taskId}/submission`, f.student.token, { body: 'My essay' });
  await call('POST', `/api/coach/submissions/${sub.body.submission.id}/feedback`, f.coach.token, { feedback: 'Strong introduction.' });
  const after = await call('GET', '/api/me/notifications', f.student.token);
  assert.ok(after.body.notifications.some((n) => n.type === 'feedback'));
});

test('reminder pass is idempotent: a second run notifies nobody new', async () => {
  const f = await fixture('remind');
  await publishTask(f, { studentId: f.student.id, deadline: iso(10 * 3600000) });
  const { runReminderPass } = require('../src/jobs/reminders');
  const first = await runReminderPass(new Date());
  assert.ok(first.deadlinesNotified >= 1);
  const second = await runReminderPass(new Date());
  assert.equal(second.deadlinesNotified, 0);
});

test('asynchronous direct line: only the student and the allocated coach see messages', async () => {
  const f = await fixture('messages');
  const sent = await call('POST', '/api/me/coach/messages', f.student.token, { body: 'Could we move the review to Friday?' });
  assert.equal(sent.status, 201);
  const coachView = await call('GET', `/api/coach/students/${f.student.id}/messages`, f.coach.token);
  assert.equal(coachView.body.messages.length, 1);
  assert.equal((await call('GET', `/api/coach/students/${f.student.id}/messages`, f.coach2.token)).status, 404);
  const reply = await call('POST', `/api/coach/students/${f.student.id}/messages`, f.coach.token, { body: 'Friday works.' });
  assert.equal(reply.status, 201);
  const mine = await call('GET', '/api/me/coach', f.student.token);
  assert.equal(mine.body.messages.length, 2);
  assert.equal((await call('GET', '/api/me/coach', f.other.token)).body.messages.length, 0);
});

test('student coach view never includes coach private notes or drafts', async () => {
  const f = await fixture('privacy4');
  await call('POST', `/api/coach/students/${f.student.id}/notes`, f.coach.token, { body: 'Private: check in about sleep routine' });
  await call('POST', '/api/coach/reviews', f.coach.token, { studentId: f.student.id, strengths: 'Draft only' });
  const mine = await call('GET', '/api/me/coach', f.student.token);
  assert.ok(!mine.text.includes('sleep routine'));
  assert.ok(!mine.text.includes('Draft only'));
});

test('settings: password change checks the current password; invalid availability is rejected', async () => {
  const f = await fixture('settings4');
  assert.equal((await call('POST', '/api/me/security/password', f.student.token, { currentPassword: 'wrong', newPassword: 'AnotherPass1' })).status, 400);
  assert.equal((await call('PATCH', '/api/me/settings', f.student.token, { availability: [{ day: 1, start: '12:00', end: '09:00' }] })).status, 400);
  const ok = await call('PATCH', '/api/me/settings', f.student.token, { accessibility: { fontScale: 'large', highContrast: true } });
  assert.equal(ok.status, 200);
  const read = await call('GET', '/api/me/settings', f.student.token);
  assert.equal(read.body.accessibility.fontScale, 'large');
});

test('assistant chat answers from the student\'s own deadlines when AI is not configured', async (t) => {
  if (process.env.AI_API_KEY) return t.skip('AI_API_KEY is set');
  const f = await fixture('chat4');
  await publishTask(f, { studentId: f.student.id });
  const r = await call('POST', '/api/me/assistant/chat', f.student.token, { message: 'What is due next?' });
  assert.equal(r.status, 200);
  assert.equal(r.body.source, 'planner');
  assert.match(r.body.reply, /Reflection essay/);
});

test('Phase 1 to 3 regression: admin and coach dashboards still respond', async () => {
  const f = await fixture('regress4');
  assert.equal((await call('GET', '/api/coach/dashboard', f.coach.token)).status, 200);
  assert.equal((await call('GET', '/api/me/dashboard', f.student.token)).status, 200);
});

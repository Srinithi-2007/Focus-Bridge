'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/services/coachRules');
const { summarize } = require('../src/services/progress');
const AppError = require('../src/utils/AppError');

const DAY = 24 * 60 * 60 * 1000;
const future = (d = 3) => new Date(Date.now() + d * DAY);
const past = (d = 3) => new Date(Date.now() - d * DAY);

test('attachment links must be http or https', () => {
  assert.equal(r.isSafeUrl('https://example.com/a'), true);
  assert.equal(r.isSafeUrl('http://example.com'), true);
  assert.equal(r.isSafeUrl('javascript:alert(1)'), false);
  assert.equal(r.isSafeUrl('data:text/html;base64,AAAA'), false);
  assert.equal(r.isSafeUrl('not a url'), false);
});

test('task target must be exactly one of student or group', () => {
  assert.throws(() => r.assertTaskTarget({ audience: 'student', studentId: null, groupId: null }), /Choose a student/);
  assert.throws(() => r.assertTaskTarget({ audience: 'student', studentId: 'x', groupId: 'y' }), /cannot also target a group/);
  assert.throws(() => r.assertTaskTarget({ audience: 'group', groupId: null, studentId: null }), /Choose a group/);
  assert.throws(() => r.assertTaskTarget({ audience: 'group', groupId: 'y', studentId: 'x' }), /cannot also target a student/);
  assert.throws(() => r.assertTaskTarget({ audience: 'everyone', studentId: 'x' }), AppError);
  assert.doesNotThrow(() => r.assertTaskTarget({ audience: 'student', studentId: 'x', groupId: null }));
  assert.doesNotThrow(() => r.assertTaskTarget({ audience: 'group', groupId: 'y', studentId: null }));
});

test('publishing requires a title, instructions and a future deadline', () => {
  const base = { title: 'Weekly plan', instructions: 'Write a plan for the week ahead.', deadline: future() };
  assert.doesNotThrow(() => r.assertPublishable(base));
  assert.throws(() => r.assertPublishable({ ...base, instructions: 'short' }), /at least 10 characters/);
  assert.throws(() => r.assertPublishable({ ...base, deadline: past() }), /must be in the future/);
  assert.throws(() => r.assertPublishable({ ...base, title: 'ab' }), /title/);
  assert.doesNotThrow(() => r.assertPublishable({ ...base, deadline: null }));
});

test('archived tasks are read-only; published audience cannot change', () => {
  assert.throws(() => r.assertTaskEditable({ status: 'archived', audience: 'student' }, { title: 'x' }), /Archived/);
  assert.throws(() => r.assertTaskEditable({ status: 'published', audience: 'student' }, { audience: 'group' }), /audience/);
  assert.doesNotThrow(() => r.assertTaskEditable({ status: 'published', audience: 'student' }, { audience: 'student' }));
  assert.doesNotThrow(() => r.assertTaskEditable({ status: 'draft', audience: 'student' }, { audience: 'group' }));
});

test('revisions are recorded only when instructions or deadline change on a published task', () => {
  const deadline = future();
  const task = { status: 'published', instructions: 'Original text here', deadline };
  assert.equal(r.isRevision(task, { instructions: 'Original text here' }), false);
  assert.equal(r.isRevision(task, { instructions: 'A new instruction set' }), true);
  assert.equal(r.isRevision(task, { deadline: future(10) }), true);
  assert.equal(r.isRevision({ ...task, status: 'draft' }, { instructions: 'changed draft' }), false);
});

test('late submissions are flagged against the deadline', () => {
  const task = { deadline: past(1) };
  assert.equal(r.isLate(task, new Date()), true);
  assert.equal(r.isLate({ deadline: future(1) }, new Date()), false);
  assert.equal(r.isLate({ deadline: null }, new Date()), false);
});

test('reviews need strengths, observations and next goals before submission', () => {
  assert.throws(() => r.assertReviewSubmittable({ strengths: 'Good', observations: '', nextGoals: '' }), /observations, next goals/);
  assert.doesNotThrow(() => r.assertReviewSubmittable({ strengths: 'Good', observations: 'Steady', nextGoals: 'Plan weekly' }));
});

test('activity times: end after start, max 8 hours, future start when requested', () => {
  const start = future(2);
  assert.doesNotThrow(() => r.assertActivityTimes({ startsAt: start, endsAt: new Date(start.getTime() + 60 * 60 * 1000) }, new Date(), { requireFuture: true }));
  assert.throws(() => r.assertActivityTimes({ startsAt: start, endsAt: start }), /after the start/);
  assert.throws(() => r.assertActivityTimes({ startsAt: start, endsAt: new Date(start.getTime() + 9 * 60 * 60 * 1000) }), /8 hours/);
  assert.throws(() => r.assertActivityTimes({ startsAt: past(1), endsAt: future(1) }, new Date(), { requireFuture: true }), /future/);
});

test('activity transitions: complete only after start and only when scheduled; cancel only when scheduled', () => {
  assert.throws(() => r.assertCanCompleteActivity({ status: 'scheduled', startsAt: future(1) }), /after it starts/);
  assert.doesNotThrow(() => r.assertCanCompleteActivity({ status: 'scheduled', startsAt: past(1) }));
  assert.throws(() => r.assertCanCompleteActivity({ status: 'completed', startsAt: past(1) }), /Only scheduled/);
  assert.throws(() => r.assertCanCancelActivity({ status: 'cancelled' }), /Only scheduled/);
  assert.doesNotThrow(() => r.assertCanCancelActivity({ status: 'scheduled' }));
});

test('replies must target a live top-level post in the same group', () => {
  const groupId = 'g1';
  assert.throws(() => r.assertValidReplyTarget(null, groupId), /not in this group/);
  assert.throws(() => r.assertValidReplyTarget({ groupId: 'g2', parentId: null }, groupId), /not in this group/);
  assert.throws(() => r.assertValidReplyTarget({ groupId, deletedAt: new Date(), parentId: null }, groupId), /removed/);
  assert.throws(() => r.assertValidReplyTarget({ groupId, deletedAt: null, parentId: 'p' }, groupId), /top-level/);
  assert.doesNotThrow(() => r.assertValidReplyTarget({ groupId, deletedAt: null, parentId: null }, groupId));
});

test('progress summary: completion, open and overdue counts; no completion when nothing assigned', () => {
  const now = new Date();
  const assigned = new Map([
    ['t1', { deadline: null }],
    ['t2', { deadline: new Date(now.getTime() + DAY) }],
    ['t3', { deadline: new Date(now.getTime() - DAY) }],
    ['t4', { deadline: null }],
  ]);
  const submitted = new Map([['t1', { status: 'submitted' }]]);
  const s = summarize({ assigned, submitted }, now);
  assert.equal(s.assignedCount, 4);
  assert.equal(s.submittedCount, 1);
  assert.equal(s.openCount, 2);
  assert.equal(s.overdueCount, 1);
  assert.equal(s.completionPct, 25);
  assert.equal(summarize({ assigned: new Map(), submitted: new Map() }).completionPct, null);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/services/rules');
const AppError = require('../src/utils/AppError');

test('csvEscape quotes commas, quotes and newlines', () => {
  assert.equal(rules.csvEscape('plain'), 'plain');
  assert.equal(rules.csvEscape('a,b'), '"a,b"');
  assert.equal(rules.csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(rules.csvEscape('line1\nline2'), '"line1\nline2"');
  assert.equal(rules.csvEscape(null), '');
});

test('csvEscape neutralizes spreadsheet formula injection', () => {
  assert.equal(rules.csvEscape('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(rules.csvEscape('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(rules.csvEscape('+1'), "'+1");
  assert.equal(rules.csvEscape('-2'), "'-2");
  assert.equal(rules.csvEscape('@sum'), "'@sum");
});

test('toCsv builds header and rows with CRLF line endings', () => {
  const out = rules.toCsv(['Name', 'Count'], [['Ada', 2], ['Lee, J', 3]]);
  assert.equal(out, 'Name,Count\r\nAda,2\r\n"Lee, J",3\r\n');
});

test('escapeRegex makes user search safe for regex use', () => {
  const pattern = new RegExp(rules.escapeRegex('a.b*(c)'));
  assert.equal(pattern.test('a.b*(c)'), true);
  assert.equal(pattern.test('axbbc'), false);
});

test('clampPagination applies defaults and maximum limit', () => {
  assert.deepEqual(rules.clampPagination({}), { page: 1, limit: 20, skip: 0 });
  assert.deepEqual(rules.clampPagination({ page: '3', limit: '500' }), { page: 3, limit: 100, skip: 200 });
  assert.deepEqual(rules.clampPagination({ page: '-4', limit: 'abc' }), { page: 1, limit: 20, skip: 0 });
});

test('parseDateRange defaults to 90 days and rejects inverted or oversized ranges', () => {
  const now = new Date('2026-11-17T10:00:00Z');
  const r = rules.parseDateRange(undefined, undefined, now);
  assert.ok(r.start < r.end);
  assert.throws(() => rules.parseDateRange('2026-05-10', '2026-05-01'), (e) => e instanceof AppError && e.status === 400);
  assert.throws(() => rules.parseDateRange('2000-01-01', '2026-01-01'), (e) => e instanceof AppError && /two years/.test(e.message));
  assert.throws(() => rules.parseDateRange('not-a-date', '2026-01-01'), (e) => e instanceof AppError);
});

test('parseDateRange treats the end date as inclusive', () => {
  const r = rules.parseDateRange('2026-01-01', '2026-01-31');
  assert.equal(r.end.toISOString(), '2026-02-01T00:00:00.000Z');
});

test('allocation rules: only active coaches and active students are assignable', () => {
  assert.throws(() => rules.assertActiveCoach({ role: 'student', status: 'active' }), /not a coach/);
  assert.throws(() => rules.assertActiveCoach({ role: 'coach', status: 'pending_approval' }), /Only active coaches/);
  assert.throws(() => rules.assertActiveCoach({ role: 'coach', status: 'deactivated' }), /Only active coaches/);
  assert.doesNotThrow(() => rules.assertActiveCoach({ role: 'coach', status: 'active' }));
  assert.throws(() => rules.assertActiveStudent({ role: 'student', status: 'invited' }), /Only active students/);
  assert.throws(() => rules.assertActiveStudent({ role: 'coach', status: 'active' }), /not a student/);
  assert.doesNotThrow(() => rules.assertActiveStudent({ role: 'student', status: 'active' }));
});

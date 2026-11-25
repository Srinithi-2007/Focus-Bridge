'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { proposeSchedule, MIN } = require('../src/services/scheduler');
const { breakDownTask } = require('../src/services/planner');
const { isWithinLead, isDeadlineSoon } = require('../src/services/reminders');
const ai = require('../src/services/ai');

// Monday 2026-11-23 08:00 UTC.
const NOW = new Date('2026-11-23T08:00:00Z');
const MON = 1;
const TUE = 2;

test('scheduler: no availability yields no blocks, feasible=false and a helpful warning', () => {
  const r = proposeSchedule({ subtasks: [{ id: 'a', title: 'x', estimateMinutes: 30 }], availability: [], now: NOW });
  assert.equal(r.blocks.length, 0);
  assert.equal(r.feasible, false);
  assert.match(r.warnings[0], /availability/);
});

test('scheduler: blocks stay inside availability windows, never overlap, and finish before the deadline', () => {
  const availability = [
    { day: MON, start: '09:00', end: '11:00' },
    { day: TUE, start: '14:00', end: '16:00' },
  ];
  const deadline = '2026-11-25T00:00:00Z';
  const r = proposeSchedule({
    subtasks: [{ id: 'a', title: 'draft', estimateMinutes: 150 }, { id: 'b', title: 'revise', estimateMinutes: 60 }],
    availability,
    now: NOW,
    deadline,
  });
  assert.equal(r.feasible, true);
  assert.equal(r.unscheduledMinutes, 0);
  for (const b of r.blocks) {
    assert.ok(b.end > b.start, 'block has positive length');
    assert.ok(b.end <= new Date(deadline), 'block finishes before deadline');
    const d = new Date(b.start);
    const hh = d.getUTCHours() * 60 + d.getUTCMinutes();
    const ok = (d.getUTCDay() === MON && hh >= 540 && hh < 660) || (d.getUTCDay() === TUE && hh >= 840 && hh < 960);
    assert.ok(ok, `block starts inside a window: ${b.start.toISOString()}`);
  }
  const sorted = [...r.blocks].sort((x, y) => x.start - y.start);
  for (let i = 1; i < sorted.length; i += 1) assert.ok(sorted[i - 1].end <= sorted[i].start, 'no overlap');
  assert.equal(r.blocks.reduce((n, b) => n + (b.end - b.start) / MIN, 0), 210);
});

test('scheduler: long subtasks are split into blocks of at most 60 minutes', () => {
  const r = proposeSchedule({
    subtasks: [{ id: 'a', title: 'long', estimateMinutes: 90 }],
    availability: [{ day: MON, start: '09:00', end: '13:00' }],
    now: NOW,
  });
  assert.deepEqual(r.blocks.map((b) => (b.end - b.start) / MIN), [60, 30]);
});

test('scheduler: reports unscheduled minutes when the deadline is too close', () => {
  const r = proposeSchedule({
    subtasks: [{ id: 'a', title: 'big', estimateMinutes: 240 }],
    availability: [{ day: MON, start: '09:00', end: '10:00' }],
    now: NOW,
    deadline: '2026-11-23T23:00:00Z',
  });
  assert.equal(r.feasible, false);
  assert.ok(r.unscheduledMinutes > 0);
  assert.match(r.warnings[0], /do not fit before the deadline/);
});

test('scheduler: never places blocks before "now"', () => {
  const r = proposeSchedule({
    subtasks: [{ id: 'a', title: 'x', estimateMinutes: 30 }],
    availability: [{ day: MON, start: '06:00', end: '12:00' }],
    now: NOW,
  });
  assert.ok(r.blocks.length > 0);
  for (const b of r.blocks) assert.ok(b.start >= NOW, 'block starts at or after now');
});

test('planner: splits multi-sentence instructions into steps', () => {
  const steps = breakDownTask({ instructions: 'Write an introduction about focus. Then list three habits. Finally write a conclusion.', priority: 'high' });
  assert.equal(steps.length, 3);
  for (const s of steps) {
    assert.ok(s.estimateMinutes >= 15 && s.estimateMinutes <= 120);
    assert.ok(s.title.length <= 120);
  }
});

test('planner: falls back to four generic steps when instructions are empty or too short', () => {
  const steps = breakDownTask({ instructions: '', priority: 'low' });
  assert.equal(steps.length, 4);
  assert.match(steps[steps.length - 1].title, /submit/i);
});

test('reminders: lead window and deadline window', () => {
  const start = new Date(NOW.getTime() + 30 * MIN);
  assert.equal(isWithinLead(start, NOW, 60), true);
  assert.equal(isWithinLead(start, NOW, 15), false);
  assert.equal(isWithinLead(new Date(NOW.getTime() - MIN), NOW, 60), false, 'already started');
  assert.equal(isDeadlineSoon(new Date(NOW.getTime() + 12 * 60 * MIN), NOW), true);
  assert.equal(isDeadlineSoon(new Date(NOW.getTime() + 3 * 24 * 60 * MIN), NOW), false);
  assert.equal(isDeadlineSoon(null, NOW), false);
});

test('AI: without a key, breakdown uses the built-in planner and says so', async (t) => {
  if (process.env.AI_API_KEY) return t.skip('AI_API_KEY is set; fallback path not under test');
  const r = await ai.breakDown({ title: 'Essay', instructions: 'Write a draft. Revise it.', priority: 'medium' });
  assert.equal(r.source, 'planner');
  assert.match(r.note, /not configured/);
  assert.ok(r.subtasks.length >= 2);
});

test('AI: local assistant lists upcoming deadlines and never claims to be AI when unconfigured', async (t) => {
  if (process.env.AI_API_KEY) return t.skip('AI_API_KEY is set');
  const r = await ai.chat({ message: 'What is due next?', context: { deadlines: [{ title: 'Essay', deadline: '2026-11-25T00:00:00Z' }] } });
  assert.equal(r.source, 'planner');
  assert.match(r.reply, /Essay/);
  const none = await ai.chat({ message: 'what is due', context: { deadlines: [] } });
  assert.match(none.reply, /no upcoming deadlines/);
});

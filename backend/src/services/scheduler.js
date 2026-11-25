'use strict';
// Deterministic schedule proposal. Pure function: no database, no clock except the `now` argument.
// Availability windows are interpreted in UTC (documented limitation: students set availability in UTC for now).
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const QUARTER = 15 * MIN;

function hhmmToMinutes(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

function startOfUtcDay(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// subtasks: [{ id, title, estimateMinutes }] (only undone subtasks should be passed)
// availability: [{ day: 0-6, start: 'HH:MM', end: 'HH:MM' }] in UTC
function proposeSchedule({ subtasks, availability, now, deadline = null, maxDays = 14, blockMinutes = 60, minBlockMinutes = 15 }) {
  const warnings = [];
  const queue = subtasks.map((s) => ({ id: String(s.id), title: s.title, remaining: s.estimateMinutes }));
  const blocks = [];
  if (!availability || availability.length === 0) {
    warnings.push('Add weekly availability in Settings so work blocks can be placed.');
    return { blocks, unscheduledMinutes: queue.reduce((n, q) => n + q.remaining, 0), feasible: false, warnings };
  }

  const horizonMs = Math.min(deadline ? new Date(deadline).getTime() : Infinity, now.getTime() + maxDays * DAY);
  let cursor = Math.ceil(now.getTime() / QUARTER) * QUARTER;
  const firstDay = startOfUtcDay(now.getTime());

  for (let d = 0; d <= maxDays && queue.length; d += 1) {
    const dayMs = firstDay + d * DAY;
    if (dayMs >= horizonMs) break;
    const weekday = new Date(dayMs).getUTCDay();
    const windows = availability
      .filter((w) => w.day === weekday)
      .map((w) => ({ s: dayMs + hhmmToMinutes(w.start) * MIN, e: dayMs + hhmmToMinutes(w.end) * MIN }))
      .filter((w) => w.e > w.s)
      .sort((a, b) => a.s - b.s);

    for (const w of windows) {
      const limit = Math.min(w.e, horizonMs);
      let t = Math.max(w.s, cursor);
      while (queue.length && limit - t >= minBlockMinutes * MIN) {
        const head = queue[0];
        const availableMinutes = Math.floor((limit - t) / MIN);
        const chunk = Math.min(head.remaining, blockMinutes, availableMinutes);
        if (chunk < minBlockMinutes && chunk < head.remaining) break;
        blocks.push({ subtaskId: head.id, start: new Date(t), end: new Date(t + chunk * MIN) });
        t += chunk * MIN;
        cursor = t;
        head.remaining -= chunk;
        if (head.remaining <= 0) queue.shift();
      }
    }
  }

  const unscheduledMinutes = queue.reduce((n, q) => n + q.remaining, 0);
  if (unscheduledMinutes > 0) {
    warnings.push(
      deadline
        ? `About ${unscheduledMinutes} minutes do not fit before the deadline with your current availability.`
        : `About ${unscheduledMinutes} minutes do not fit in the next ${maxDays} days with your current availability.`
    );
  }
  return { blocks, unscheduledMinutes, feasible: unscheduledMinutes === 0, warnings };
}

module.exports = { proposeSchedule, hhmmToMinutes, MIN };

'use strict';
// Reminder logic. Pure helpers are unit tested; `runReminderPass` is the scheduled job body.
const HOUR = 60 * 60 * 1000;

// True when an event starts within the student's lead time from now (and has not already started).
function isWithinLead(start, now, leadMinutes) {
  const s = new Date(start).getTime();
  const n = now.getTime();
  return s > n && s - n <= leadMinutes * 60 * 1000;
}

// Deadlines inside the next 24 hours get a reminder.
function isDeadlineSoon(deadline, now) {
  if (!deadline) return false;
  const d = new Date(deadline).getTime();
  return d > now.getTime() && d - now.getTime() <= 24 * HOUR;
}

module.exports = { isWithinLead, isDeadlineSoon };

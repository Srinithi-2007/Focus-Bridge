'use strict';
// Scheduled reminder pass. Runs as a short batch (npm run jobs or a cron entry), not as a continuously running chatbot.
const { isWithinLead, isDeadlineSoon } = require('../services/reminders');
const { notify } = require('../services/notifications');
const CalendarEvent = require('../models/CalendarEvent');
const StudentProfile = require('../models/StudentProfile');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const Group = require('../models/Group');
const User = require('../models/User');

async function runReminderPass(now = new Date()) {
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let eventsNotified = 0;
  let deadlinesNotified = 0;

  // 1. Upcoming work blocks, using each student's lead time.
  const events = await CalendarEvent.find({ done: false, reminderSentAt: null, start: { $gt: now, $lte: horizon } }).limit(2000);
  const userIds = [...new Set(events.map((e) => String(e.userId)))];
  const profiles = await StudentProfile.find({ userId: { $in: userIds } }).select('userId preferences').lean();
  const lead = new Map(profiles.map((p) => [String(p.userId), p.preferences?.reminderLeadMinutes || 60]));
  for (const ev of events) {
    const minutes = lead.get(String(ev.userId)) || 60;
    if (!isWithinLead(ev.start, now, minutes)) continue;
    const ok = await notify({
      organizationId: ev.organizationId,
      userId: ev.userId,
      type: 'reminder',
      title: `Upcoming work block: ${ev.title}`,
      body: `Starts at ${new Date(ev.start).toUTCString().slice(17, 22)} UTC`,
      link: '/student/calendar',
      dedupeKey: `event:${ev._id}`,
    });
    await CalendarEvent.updateOne({ _id: ev._id }, { reminderSentAt: now });
    if (ok) eventsNotified += 1;
  }

  // 2. Published tasks due within 24 hours that the student has not submitted.
  const tasks = await Task.find({ status: 'published', deadline: { $gt: now, $lte: horizon } }).select('organizationId title deadline audience studentId groupId').lean();
  for (const task of tasks) {
    if (!isDeadlineSoon(task.deadline, now)) continue;
    let assignees = [];
    if (task.audience === 'student') assignees = [task.studentId];
    else {
      const g = await Group.findById(task.groupId).select('memberIds').lean();
      assignees = g ? g.memberIds : [];
    }
    const active = await User.find({ _id: { $in: assignees }, role: 'student', status: 'active' }).select('_id').lean();
    const submitted = new Set((await Submission.find({ taskId: task._id, studentId: { $in: active.map((a) => a._id) } }).select('studentId').lean()).map((s) => String(s.studentId)));
    for (const a of active) {
      if (submitted.has(String(a._id))) continue;
      const ok = await notify({
        organizationId: task.organizationId,
        userId: a._id,
        type: 'deadline',
        title: `Due soon: ${task.title}`,
        body: `Deadline ${new Date(task.deadline).toUTCString().slice(0, 22)}`,
        link: '/student/tasks',
        dedupeKey: `deadline:${task._id}:${a._id}`,
      });
      if (ok) deadlinesNotified += 1;
    }
  }

  return { eventsNotified, deadlinesNotified };
}

module.exports = { runReminderPass };

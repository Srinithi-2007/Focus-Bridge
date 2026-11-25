'use strict';
// Computes per-student progress for one coach's published tasks. Used by lists, profiles, dashboard and reports.
// Only the coach's own published tasks are considered, and only the coach's allocated students are included.
const Group = require('../models/Group');
const Task = require('../models/Task');
const Submission = require('../models/Submission');

async function buildProgress({ organizationId, coachId, studentIds, now = new Date() }) {
  const wanted = new Set(studentIds.map(String));
  const stats = new Map(studentIds.map((id) => [String(id), { assigned: new Map(), submitted: new Map() }]));
  if (wanted.size === 0) return stats;

  const [groups, tasks] = await Promise.all([
    Group.find({ organizationId, coachId }).select('_id memberIds').lean(),
    Task.find({ organizationId, coachId, status: 'published' }).select('_id audience studentId groupId deadline title').lean(),
  ]);
  const membersByGroup = new Map(groups.map((g) => [String(g._id), g.memberIds.map(String)]));

  for (const task of tasks) {
    const taskId = String(task._id);
    const assignees = task.audience === 'student' ? [String(task.studentId)] : membersByGroup.get(String(task.groupId)) || [];
    for (const sid of assignees) {
      if (!wanted.has(sid)) continue;
      stats.get(sid).assigned.set(taskId, task);
    }
  }

  const taskIds = tasks.map((t) => t._id);
  const subs = taskIds.length
    ? await Submission.find({ organizationId, studentId: { $in: studentIds }, taskId: { $in: taskIds } })
        .select('taskId studentId submittedAt status late attempts feedback feedbackAt')
        .lean()
    : [];
  for (const s of subs) {
    const entry = stats.get(String(s.studentId));
    if (entry && entry.assigned.has(String(s.taskId))) entry.submitted.set(String(s.taskId), s);
  }

  return stats;
}

// Turns the raw index into the numbers shown on screens.
function summarize(entry, now = new Date()) {
  const assignedCount = entry.assigned.size;
  const submittedCount = entry.submitted.size;
  let openCount = 0;
  let overdueCount = 0;
  for (const [taskId, task] of entry.assigned) {
    if (entry.submitted.has(taskId)) continue;
    if (task.deadline && new Date(task.deadline) < now) overdueCount += 1;
    else openCount += 1;
  }
  return {
    assignedCount,
    submittedCount,
    openCount,
    overdueCount,
    completionPct: assignedCount ? Math.round((submittedCount / assignedCount) * 100) : null,
  };
}

module.exports = { buildProgress, summarize };

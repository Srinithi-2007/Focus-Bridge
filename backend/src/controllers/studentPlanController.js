'use strict';
// Plans, calendar and assistant for students. AI and the built-in planner only PROPOSE. Nothing reaches the calendar
// until the student approves, and coach instructions and deadlines are never changed by a plan.
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { proposeSchedule } = require('../services/scheduler');
const { breakDown, chat } = require('../services/ai');
const { isId } = require('../services/coachAccess');
const { assignedFilter } = require('./studentPortalController');
const { getProfile } = require('./studentWorkspaceController');
const Plan = require('../models/Plan');
const CalendarEvent = require('../models/CalendarEvent');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const Activity = require('../models/Activity');
const Group = require('../models/Group');

const schemas = {
  updatePlan: z.object({
    subtasks: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{24}$/).optional(), title: z.string().trim().min(3).max(160), estimateMinutes: z.number().int().min(5).max(480) })).min(1).max(12).optional(),
    blocks: z.array(z.object({ subtaskId: z.string().regex(/^[a-f0-9]{24}$/), start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) })).max(60).optional(),
  }).refine((v) => v.subtasks || v.blocks, 'Provide subtasks or blocks'),
  toggle: z.object({ done: z.boolean() }),
  chat: z.object({ message: z.string().trim().min(1).max(1000) }),
  calendarQuery: z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }),
};

async function visibleTask(student, taskId) {
  if (!isId(taskId)) throw new AppError(404, 'Task not found');
  const task = await Task.findOne({ _id: taskId, ...(await assignedFilter(student)) });
  if (!task) throw new AppError(404, 'Task not found');
  return task;
}

async function getOwnPlan(student, id) {
  if (!isId(id)) throw new AppError(404, 'Plan not found');
  const plan = await Plan.findOne({ _id: id, studentId: student._id, organizationId: student.organizationId });
  if (!plan) throw new AppError(404, 'Plan not found');
  return plan;
}

function presentPlan(plan, taskTitle) {
  return {
    id: String(plan._id),
    taskId: String(plan.taskId),
    taskTitle,
    status: plan.status,
    source: plan.source,
    sourceNote: plan.sourceNote,
    subtasks: plan.subtasks.map((s) => ({ id: String(s._id), title: s.title, estimateMinutes: s.estimateMinutes, done: s.done })),
    blocks: plan.blocks.map((b) => ({ id: String(b._id), subtaskId: String(b.subtaskId), start: b.start, end: b.end })),
    unscheduledMinutes: plan.unscheduledMinutes,
    feasible: plan.feasible,
    warnings: plan.warnings,
    approvedAt: plan.approvedAt,
    createdAt: plan.createdAt,
  };
}

async function planFor(student, plan) {
  const task = await Task.findById(plan.taskId).select('title').lean();
  return presentPlan(plan, task ? task.title : 'Task');
}

// Schedules the not-yet-done subtasks against the student's availability and the task deadline.
async function scheduleFor(student, subtasks, deadline) {
  const profile = await getProfile(student);
  const todo = subtasks.filter((s) => !s.done).map((s) => ({ id: String(s._id), title: s.title, estimateMinutes: s.estimateMinutes }));
  return proposeSchedule({ subtasks: todo, availability: profile.availability, now: new Date(), deadline });
}

// Generates a new proposal for an assigned task. Earlier proposals for the same task are superseded.
async function generatePlan(req, res) {
  const student = req.user;
  const task = await visibleTask(student, req.params.id);
  if (task.status !== 'published') throw new AppError(409, 'Plans can only be made for published tasks');

  const { subtasks: raw, source, note } = await breakDown({ title: task.title, instructions: task.instructions, priority: task.priority });
  const subtasks = raw.map((s) => ({ title: s.title, estimateMinutes: s.estimateMinutes, done: false }));
  const plan = new Plan({ organizationId: student.organizationId, studentId: student._id, taskId: task._id, status: 'proposed', source, sourceNote: note, subtasks });
  const sched = await scheduleFor(student, plan.subtasks, task.deadline);
  plan.blocks = sched.blocks.map((b) => {
    return { subtaskId: b.subtaskId, start: b.start, end: b.end };
  });
  plan.unscheduledMinutes = sched.unscheduledMinutes;
  plan.feasible = sched.feasible;
  plan.warnings = sched.warnings;
  await plan.save();

  await Plan.updateMany({ studentId: student._id, taskId: task._id, status: 'proposed', _id: { $ne: plan._id } }, { status: 'superseded' });
  await recordAudit({ organizationId: student.organizationId, actorId: student._id, action: 'plan.generate', targetType: 'task', targetId: task._id, summary: `Proposed a plan (${source})` });
  res.status(201).json({ plan: await planFor(student, plan) });
}

async function listPlans(req, res) {
  const student = req.user;
  const filter = { studentId: student._id, organizationId: student.organizationId, status: { $in: ['proposed', 'approved'] } };
  if (req.query.taskId && isId(req.query.taskId)) filter.taskId = req.query.taskId;
  const plans = await Plan.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  const tasks = new Map((await Task.find({ _id: { $in: plans.map((p) => p.taskId) } }).select('title').lean()).map((t) => [String(t._id), t.title]));
  res.json({ plans: plans.map((p) => presentPlan(p, tasks.get(String(p.taskId)) || 'Task')) });
}

async function getPlan(req, res) {
  const plan = await getOwnPlan(req.user, req.params.id);
  const now = new Date();
  const missed = plan.blocks.filter((b) => plan.status === 'approved' && new Date(b.end) < now).length;
  res.json({ plan: { ...(await planFor(req.user, plan)), missedBlocks: missed } });
}

// Edits to a proposal. Subtask changes trigger rescheduling; manual block times are validated against the deadline and each other.
async function updatePlan(req, res) {
  const student = req.user;
  const plan = await getOwnPlan(student, req.params.id);
  if (plan.status !== 'proposed') throw new AppError(409, 'Only proposed plans can be edited');
  const task = await Task.findById(plan.taskId).select('deadline status').lean();
  if (!task || task.status !== 'published') throw new AppError(409, 'The task is no longer open');

  if (req.body.subtasks) {
    plan.subtasks = req.body.subtasks.map((s) => ({ _id: s.id || undefined, title: s.title, estimateMinutes: s.estimateMinutes, done: false }));
    const sched = await scheduleFor(student, plan.subtasks, task.deadline);
    plan.blocks = sched.blocks.map((b) => ({ subtaskId: b.subtaskId, start: b.start, end: b.end }));
    plan.unscheduledMinutes = sched.unscheduledMinutes;
    plan.feasible = sched.feasible;
    plan.warnings = sched.warnings;
  }
  if (req.body.blocks) {
    const ids = new Set(plan.subtasks.map((s) => String(s._id)));
    const blocks = req.body.blocks.map((b) => ({ subtaskId: b.subtaskId, start: new Date(b.start), end: new Date(b.end) }));
    const sorted = [...blocks].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i += 1) {
      const b = sorted[i];
      if (!ids.has(String(b.subtaskId))) throw new AppError(400, 'A block refers to a subtask that is not in this plan');
      if (b.end <= b.start) throw new AppError(400, 'Each block must end after it starts');
      if (task.deadline && b.end > new Date(task.deadline)) throw new AppError(400, 'Blocks must finish before the task deadline');
      if (i > 0 && sorted[i - 1].end > b.start) throw new AppError(400, 'Blocks cannot overlap');
    }
    plan.blocks = blocks;
    plan.warnings = plan.warnings.filter((w) => !/do not fit/.test(w));
  }
  await plan.save();
  res.json({ plan: await planFor(student, plan) });
}

async function approvePlan(req, res) {
  const student = req.user;
  const plan = await getOwnPlan(student, req.params.id);
  if (plan.status !== 'proposed') throw new AppError(409, 'Only proposed plans can be approved');
  if (plan.blocks.length === 0) throw new AppError(409, 'Add at least one work block before approving');

  const task = await Task.findById(plan.taskId).select('title status').lean();
  if (!task || task.status !== 'published') throw new AppError(409, 'The task is no longer open');
  const titleOf = new Map(plan.subtasks.map((s) => [String(s._id), s.title]));

  await CalendarEvent.insertMany(
    plan.blocks.map((b) => ({
      organizationId: student.organizationId,
      userId: student._id,
      planId: plan._id,
      taskId: plan.taskId,
      subtaskId: b.subtaskId,
      title: `${task.title}: ${titleOf.get(String(b.subtaskId)) || 'work block'}`,
      start: b.start,
      end: b.end,
    }))
  );
  plan.status = 'approved';
  plan.approvedAt = new Date();
  await plan.save();
  await recordAudit({ organizationId: student.organizationId, actorId: student._id, action: 'plan.approve', targetType: 'plan', targetId: plan._id, summary: `Approved a plan with ${plan.blocks.length} work block(s)` });
  res.json({ plan: await planFor(student, plan), calendarEventsAdded: plan.blocks.length });
}

async function rejectPlan(req, res) {
  const plan = await getOwnPlan(req.user, req.params.id);
  if (plan.status !== 'proposed') throw new AppError(409, 'Only proposed plans can be rejected');
  plan.status = 'rejected';
  await plan.save();
  res.json({ plan: await planFor(req.user, plan) });
}

// Marks a subtask done. Done subtasks stop counting toward open work.
async function toggleSubtask(req, res) {
  const plan = await getOwnPlan(req.user, req.params.id);
  if (plan.status !== 'approved') throw new AppError(409, 'Subtasks can be ticked once a plan is approved');
  const sub = isId(req.params.subtaskId) ? plan.subtasks.id(req.params.subtaskId) : null;
  if (!sub) throw new AppError(404, 'Subtask not found');
  sub.done = req.body.done;
  sub.doneAt = req.body.done ? new Date() : null;
  await plan.save();
  res.json({ plan: await planFor(req.user, plan) });
}

// Re-plans the remaining undone subtasks from now. Creates a new proposal; the approved calendar is left unchanged until approved.
async function reschedule(req, res) {
  const student = req.user;
  const plan = await getOwnPlan(student, req.params.id);
  if (plan.status !== 'approved') throw new AppError(409, 'Only approved plans can be rescheduled');
  const task = await Task.findById(plan.taskId).select('deadline status title').lean();
  if (!task || task.status !== 'published') throw new AppError(409, 'The task is no longer open');
  const next = new Plan({
    organizationId: student.organizationId,
    studentId: student._id,
    taskId: plan.taskId,
    status: 'proposed',
    source: plan.source,
    sourceNote: 'Re-planned from your remaining subtasks',
    subtasks: plan.subtasks.filter((s) => !s.done).map((s) => ({ title: s.title, estimateMinutes: s.estimateMinutes, done: false })),
  });
  const sched = await scheduleFor(student, next.subtasks, task.deadline);
  next.blocks = sched.blocks.map((b) => ({ subtaskId: b.subtaskId, start: b.start, end: b.end }));
  next.unscheduledMinutes = sched.unscheduledMinutes;
  next.feasible = sched.feasible;
  next.warnings = sched.warnings;
  await next.save();
  res.status(201).json({ plan: await planFor(student, next) });
}

async function getCalendar(req, res) {
  const student = req.user;
  const now = new Date();
  const from = req.query.from ? new Date(req.query.from) : new Date(now.getTime() - 7 * 86400000);
  const to = req.query.to ? new Date(req.query.to) : new Date(now.getTime() + 28 * 86400000);
  if (to <= from) throw new AppError(400, 'The end of the range must be after the start');
  if (to - from > 62 * 86400000) throw new AppError(400, 'Calendar ranges can be at most 62 days');

  const groupIds = (await Group.find({ organizationId: student.organizationId, memberIds: student._id }).select('_id').lean()).map((g) => g._id);
  const [events, tasks, activities, submissions] = await Promise.all([
    CalendarEvent.find({ userId: student._id, start: { $gte: from, $lt: to } }).sort({ start: 1 }).lean(),
    Task.find({ ...(await assignedFilter(student)), deadline: { $gte: from, $lt: to } }).select('title deadline').lean(),
    Activity.find({ organizationId: student.organizationId, groupId: { $in: groupIds }, startsAt: { $gte: from, $lt: to }, status: { $ne: 'cancelled' } }).sort({ startsAt: 1 }).lean(),
    Submission.find({ organizationId: student.organizationId, studentId: student._id }).select('taskId').lean(),
  ]);
  const submitted = new Set(submissions.map((s) => String(s.taskId)));
  res.json({
    range: { from, to },
    workBlocks: events.map((e) => ({ id: String(e._id), title: e.title, start: e.start, end: e.end, done: e.done, taskId: e.taskId ? String(e.taskId) : null })),
    deadlines: tasks.map((t) => ({ id: String(t._id), title: t.title, deadline: t.deadline, submitted: submitted.has(String(t._id)) })),
    activities: activities.map((a) => ({ id: String(a._id), title: a.title, startsAt: a.startsAt, endsAt: a.endsAt, status: a.status, location: a.location })),
  });
}

async function toggleEvent(req, res) {
  if (!isId(req.params.id)) throw new AppError(404, 'Event not found');
  const ev = await CalendarEvent.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { done: req.body.done }, { new: true });
  if (!ev) throw new AppError(404, 'Event not found');
  res.json({ event: { id: String(ev._id), done: ev.done } });
}

// AI chat (stateless). Context contains only this student's own deadlines and blocks.
async function assistantChat(req, res) {
  const student = req.user;
  const now = new Date();
  const tasks = await Task.find(await assignedFilter(student)).sort({ deadline: 1 }).limit(20).select('title deadline').lean();
  const subs = await Submission.find({ organizationId: student.organizationId, studentId: student._id }).select('taskId').lean();
  const done = new Set(subs.map((s) => String(s.taskId)));
  const deadlines = tasks.filter((t) => !done.has(String(t._id)) && (!t.deadline || new Date(t.deadline) > now)).map((t) => ({ title: t.title, deadline: t.deadline }));
  const result = await chat({ message: req.body.message, context: { deadlines, now: now.toISOString() } });
  res.json(result);
}

module.exports = { schemas, generatePlan, listPlans, getPlan, updatePlan, approvePlan, rejectPlan, toggleSubtask, reschedule, getCalendar, toggleEvent, assistantChat };

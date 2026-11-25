'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { isSafeUrl, assertTaskTarget, assertPublishable, assertTaskEditable, isRevision } = require('../services/coachRules');
const { getAllocatedStudent, getOwnedGroup, getOwnedTask, isId } = require('../services/coachAccess');
const { recordSubmissionFeedback } = require('./coachFeedbackHelper');
const { notify } = require('../services/notifications');
const User = require('../models/User');
const Group = require('../models/Group');
const Task = require('../models/Task');
const Submission = require('../models/Submission');

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const isoDate = z.string().datetime({ offset: true });
const attachment = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().max(2048).refine(isSafeUrl, 'Links must start with http:// or https://'),
});

const taskFields = {
  title: z.string().trim().min(3).max(150),
  instructions: z.string().trim().max(5000),
  priority: z.enum(['low', 'medium', 'high']),
  deadline: isoDate.nullable(),
  audience: z.enum(['student', 'group']),
  studentId: objectId.nullable(),
  groupId: objectId.nullable(),
  attachments: z.array(attachment).max(10),
};

const schemas = {
  createTask: z.object({
    ...taskFields,
    instructions: taskFields.instructions.default(''),
    priority: taskFields.priority.default('medium'),
    deadline: taskFields.deadline.optional().default(null),
    studentId: taskFields.studentId.optional().default(null),
    groupId: taskFields.groupId.optional().default(null),
    attachments: taskFields.attachments.default([]),
    publish: z.boolean().default(false),
  }),
  updateTask: z
    .object({
      title: taskFields.title,
      instructions: taskFields.instructions,
      priority: taskFields.priority,
      deadline: taskFields.deadline,
      audience: taskFields.audience,
      studentId: taskFields.studentId,
      groupId: taskFields.groupId,
      attachments: taskFields.attachments,
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update'),
  listTasks: z.object({
    status: z.enum(['draft', 'published', 'archived']).optional(),
    groupId: objectId.optional(),
    studentId: objectId.optional(),
  }),
  feedback: z.object({ feedback: z.string().trim().min(1).max(3000) }),
};

// Ensures a target belongs to this coach: an allocated student or an owned group. Students must also be active.
async function validateTarget(coach, { audience, studentId, groupId }, { requireActive = false } = {}) {
  assertTaskTarget({ audience, studentId, groupId });
  if (audience === 'student') {
    const student = await getAllocatedStudent(coach, studentId);
    if (requireActive && student.status !== 'active') throw new AppError(400, 'Only active students can receive tasks');
  } else {
    await getOwnedGroup(coach, groupId);
  }
}

// Counts how many students a task is for. Group size comes from current membership.
async function assigneeCount(task) {
  if (task.audience === 'student') return 1;
  const group = await Group.findById(task.groupId).select('memberIds').lean();
  return group ? group.memberIds.length : 0;
}

async function presentTask(coach, task, { detail = false } = {}) {
  const counts = await Submission.aggregate([
    { $match: { taskId: task._id } },
    { $group: { _id: null, submitted: { $sum: 1 }, reviewed: { $sum: { $cond: [{ $eq: ['$status', 'reviewed'] }, 1, 0] } } } },
  ]);
  const submitted = counts[0]?.submitted || 0;
  const reviewed = counts[0]?.reviewed || 0;
  const assignees = await assigneeCount(task);

  let target = null;
  if (task.audience === 'student') {
    const s = await User.findById(task.studentId).select('firstName lastName').lean();
    target = s ? { type: 'student', id: String(task.studentId), name: `${s.firstName} ${s.lastName}`.trim() } : null;
  } else {
    const g = await Group.findById(task.groupId).select('name').lean();
    target = g ? { type: 'group', id: String(task.groupId), name: g.name } : null;
  }

  const base = {
    id: String(task._id),
    title: task.title,
    instructions: task.instructions,
    priority: task.priority,
    deadline: task.deadline,
    audience: task.audience,
    target,
    status: task.status,
    attachments: task.attachments,
    publishedAt: task.publishedAt,
    originalInstructions: task.originalInstructions,
    originalDeadline: task.originalDeadline,
    revisionCount: task.revisionCount,
    lastEditedAt: task.lastEditedAt,
    assigneeCount: assignees,
    submittedCount: submitted,
    reviewedCount: reviewed,
    updatedAt: task.updatedAt,
  };
  return base;
}

async function listTasks(req, res) {
  const coach = req.user;
  const filter = { organizationId: coach.organizationId, coachId: coach._id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.groupId) {
    await getOwnedGroup(coach, req.query.groupId);
    filter.groupId = req.query.groupId;
  }
  if (req.query.studentId) {
    await getAllocatedStudent(coach, req.query.studentId);
    filter.studentId = req.query.studentId;
  }
  const tasks = await Task.find(filter).sort({ updatedAt: -1 }).limit(300);
  res.json({ tasks: await Promise.all(tasks.map((t) => presentTask(coach, t))) });
}

async function createTask(req, res) {
  const coach = req.user;
  const body = req.body;
  await validateTarget(coach, body, { requireActive: body.publish });

  const task = new Task({
    organizationId: coach.organizationId,
    coachId: coach._id,
    title: body.title,
    instructions: body.instructions,
    priority: body.priority,
    deadline: body.deadline,
    audience: body.audience,
    studentId: body.audience === 'student' ? body.studentId : null,
    groupId: body.audience === 'group' ? body.groupId : null,
    attachments: body.attachments,
    status: 'draft',
  });

  if (body.publish) {
    assertPublishable(task);
    task.status = 'published';
    task.publishedAt = new Date();
    task.originalInstructions = task.instructions;
    task.originalDeadline = task.deadline;
  }
  await task.save();
  if (body.publish) await notifyAssignees(task);
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: body.publish ? 'task.publish' : 'task.create', targetType: 'task', targetId: task._id, summary: `${body.publish ? 'Published' : 'Saved draft of'} task "${task.title}"` });
  res.status(201).json({ task: await presentTask(coach, task) });
}

async function getTask(req, res) {
  const coach = req.user;
  const task = await getOwnedTask(coach, req.params.id);
  const view = await presentTask(coach, task);

  // Assignee list: allocated students only. Other group members are counted but not named to this coach.
  let assignees = [];
  let hiddenAssigneeCount = 0;
  let memberIds = [];
  if (task.audience === 'student') memberIds = [task.studentId];
  else {
    const group = await Group.findById(task.groupId).select('memberIds').lean();
    memberIds = group ? group.memberIds : [];
  }
  const allocated = await User.find({ organizationId: coach.organizationId, role: 'student', coachId: coach._id, _id: { $in: memberIds } })
    .select('firstName lastName email status')
    .lean();
  const allocatedIds = new Set(allocated.map((a) => String(a._id)));
  hiddenAssigneeCount = memberIds.filter((m) => !allocatedIds.has(String(m))).length;

  const subs = await Submission.find({ taskId: task._id, studentId: { $in: [...allocatedIds] } }).lean();
  const subByStudent = new Map(subs.map((s) => [String(s.studentId), s]));
  const now = new Date();
  assignees = allocated.map((a) => {
    const s = subByStudent.get(String(a._id));
    let state = 'not_started';
    if (s) state = s.status === 'reviewed' ? 'reviewed' : 'submitted';
    else if (task.deadline && new Date(task.deadline) < now) state = 'overdue';
    return {
      studentId: String(a._id),
      name: `${a.firstName} ${a.lastName}`.trim(),
      email: a.email,
      state,
      submission: s
        ? {
            id: String(s._id),
            body: s.body,
            attachments: s.attachments,
            submittedAt: s.submittedAt,
            late: s.late,
            attempts: s.attempts,
            feedback: s.feedback,
            feedbackAt: s.feedbackAt,
            status: s.status,
          }
        : null,
    };
  });

  res.json({ task: view, assignees, hiddenAssigneeCount });
}

async function updateTask(req, res) {
  const coach = req.user;
  const task = await getOwnedTask(coach, req.params.id);
  const changes = req.body;

  assertTaskEditable(task, changes);

  if (task.status === 'published') {
    // Targets of a published task are fixed; instructions, deadline, priority and attachments may be revised.
    const currentStudent = task.studentId ? String(task.studentId) : null;
    const currentGroup = task.groupId ? String(task.groupId) : null;
    if (changes.studentId !== undefined && changes.studentId !== currentStudent) throw new AppError(409, 'The target of a published task cannot be changed');
    if (changes.groupId !== undefined && changes.groupId !== currentGroup) throw new AppError(409, 'The target of a published task cannot be changed');
  }

  const revision = isRevision(task, changes);
  const nextAudience = changes.audience ?? task.audience;
  const nextTargets = {
    audience: nextAudience,
    studentId: changes.studentId !== undefined ? changes.studentId : task.studentId ? String(task.studentId) : null,
    groupId: changes.groupId !== undefined ? changes.groupId : task.groupId ? String(task.groupId) : null,
  };
  if (task.status === 'draft' && (changes.audience !== undefined || changes.studentId !== undefined || changes.groupId !== undefined)) {
    await validateTarget(coach, nextTargets);
    task.audience = nextTargets.audience;
    task.studentId = nextTargets.audience === 'student' ? nextTargets.studentId : null;
    task.groupId = nextTargets.audience === 'group' ? nextTargets.groupId : null;
  }

  for (const key of ['title', 'instructions', 'priority', 'deadline', 'attachments']) {
    if (changes[key] !== undefined) task[key] = changes[key];
  }
  if (task.status === 'published' && changes.deadline && new Date(changes.deadline) <= new Date()) {
    throw new AppError(400, 'The deadline must be in the future');
  }
  if (revision) {
    task.revisionCount += 1;
    task.lastEditedAt = new Date();
  }
  await task.save();
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'task.update', targetType: 'task', targetId: task._id, summary: `Updated task "${task.title}"${revision ? ' (revision recorded)' : ''}` });
  res.json({ task: await presentTask(coach, task) });
}

async function publishTask(req, res) {
  const coach = req.user;
  const task = await getOwnedTask(coach, req.params.id);
  if (task.status !== 'draft') throw new AppError(409, 'Only drafts can be published');
  await validateTarget(coach, { audience: task.audience, studentId: task.studentId && String(task.studentId), groupId: task.groupId && String(task.groupId) }, { requireActive: true });
  assertPublishable(task);
  task.status = 'published';
  task.publishedAt = new Date();
  task.originalInstructions = task.instructions;
  task.originalDeadline = task.deadline;
  await task.save();
  await notifyAssignees(task);
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'task.publish', targetType: 'task', targetId: task._id, summary: `Published task "${task.title}"` });
  res.json({ task: await presentTask(coach, task) });
}

async function archiveTask(req, res) {
  const coach = req.user;
  const task = await getOwnedTask(coach, req.params.id);
  if (task.status !== 'published') throw new AppError(409, 'Only published tasks can be archived');
  task.status = 'archived';
  await task.save();
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'task.archive', targetType: 'task', targetId: task._id, summary: `Archived task "${task.title}"` });
  res.json({ task: await presentTask(coach, task) });
}

async function deleteTask(req, res) {
  const coach = req.user;
  const task = await getOwnedTask(coach, req.params.id);
  if (task.status !== 'draft') throw new AppError(409, 'Only drafts can be deleted. Archive published tasks instead.');
  await Task.deleteOne({ _id: task._id, organizationId: coach.organizationId, coachId: coach._id });
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'task.delete', targetType: 'task', targetId: task._id, summary: `Deleted draft "${task.title}"` });
  res.json({ message: 'Draft deleted' });
}

async function giveFeedback(req, res) {
  if (!isId(req.params.id)) throw new AppError(404, 'Submission not found');
  const result = await recordSubmissionFeedback(req.user, req.params.id, req.body.feedback);
  res.json(result);
}

// Tells each assigned (active) student a task has been published. Group members are notified individually.
async function notifyAssignees(task) {
  let ids = [];
  if (task.audience === 'student') ids = [task.studentId];
  else {
    const g = await Group.findById(task.groupId).select('memberIds').lean();
    ids = g ? g.memberIds : [];
  }
  await Promise.all(
    ids.map((uid) =>
      notify({
        organizationId: task.organizationId,
        userId: uid,
        type: 'task',
        title: 'New task assigned',
        body: task.title,
        link: '/student/tasks',
      })
    )
  );
}

module.exports = { schemas, listTasks, createTask, getTask, updateTask, publishTask, archiveTask, deleteTask, giveFeedback, presentTask };

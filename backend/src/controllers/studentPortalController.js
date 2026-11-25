'use strict';
// Backend capabilities for future Student pages (Phase 4). No Student UI is built in this phase.
// Students see only tasks assigned to them or to a group they belong to, and only their own submissions and feedback.
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { isSafeUrl, isLate, assertValidReplyTarget } = require('../services/coachRules');
const { isId } = require('../services/coachAccess');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const Group = require('../models/Group');
const GroupPost = require('../models/GroupPost');

const schemas = {
  submit: z
    .object({
      body: z.string().trim().max(5000).default(''),
      attachments: z.array(z.object({ name: z.string().trim().min(1).max(120), url: z.string().trim().max(2048).refine(isSafeUrl, 'Links must start with http:// or https://') })).max(10).default([]),
    })
    .refine((v) => v.body.length > 0 || v.attachments.length > 0, 'Add a response or an attachment before submitting'),
  post: z.object({
    body: z.string().trim().min(1).max(2000),
    parentId: z.string().regex(/^[a-f0-9]{24}$/).nullable().optional(),
  }),
};

async function myGroupIds(student) {
  const groups = await Group.find({ organizationId: student.organizationId, memberIds: student._id }).select('_id').lean();
  return groups.map((g) => g._id);
}

async function assignedFilter(student) {
  const groupIds = await myGroupIds(student);
  return {
    organizationId: student.organizationId,
    status: 'published',
    $or: [{ audience: 'student', studentId: student._id }, { audience: 'group', groupId: { $in: groupIds } }],
  };
}

async function listMyTasks(req, res) {
  const student = req.user;
  const tasks = await Task.find(await assignedFilter(student)).sort({ deadline: 1, publishedAt: -1 }).limit(200).lean();
  const subs = await Submission.find({ organizationId: student.organizationId, studentId: student._id, taskId: { $in: tasks.map((t) => t._id) } }).lean();
  const subBy = new Map(subs.map((s) => [String(s.taskId), s]));
  const now = new Date();
  res.json({
    tasks: tasks.map((t) => {
      const s = subBy.get(String(t._id));
      return {
        id: String(t._id),
        title: t.title,
        instructions: t.instructions,
        priority: t.priority,
        deadline: t.deadline,
        attachments: t.attachments,
        overdue: !s && Boolean(t.deadline) && new Date(t.deadline) < now,
        submission: s
          ? { id: String(s._id), body: s.body, attachments: s.attachments, status: s.status, submittedAt: s.submittedAt, late: s.late, attempts: s.attempts, feedback: s.feedback || null, feedbackAt: s.feedbackAt }
          : null,
      };
    }),
  });
}

async function submitTask(req, res) {
  const student = req.user;
  if (!isId(req.params.id)) throw new AppError(404, 'Task not found');
  const task = await Task.findOne({ _id: req.params.id, ...(await assignedFilter(student)) });
  if (!task) throw new AppError(404, 'Task not found');
  if (task.status !== 'published') throw new AppError(409, 'This task is not open for submissions');

  const now = new Date();
  const existing = await Submission.findOne({ taskId: task._id, studentId: student._id });
  if (existing) {
    existing.body = req.body.body;
    existing.attachments = req.body.attachments;
    existing.submittedAt = now;
    existing.attempts += 1;
    existing.late = isLate(task, now);
    existing.status = 'submitted';
    await existing.save();
    await recordAudit({ organizationId: student.organizationId, actorId: student._id, action: 'submission.resubmit', targetType: 'task', targetId: task._id, summary: `Resubmitted "${task.title}"` });
    return res.json({ submission: { id: String(existing._id), attempts: existing.attempts, late: existing.late, submittedAt: existing.submittedAt } });
  }
  const created = await Submission.create({
    organizationId: student.organizationId,
    taskId: task._id,
    studentId: student._id,
    body: req.body.body,
    attachments: req.body.attachments,
    submittedAt: now,
    late: isLate(task, now),
  });
  await recordAudit({ organizationId: student.organizationId, actorId: student._id, action: 'submission.create', targetType: 'task', targetId: task._id, summary: `Submitted "${task.title}"` });
  res.status(201).json({ submission: { id: String(created._id), attempts: 1, late: created.late, submittedAt: created.submittedAt } });
}

async function listMyGroups(req, res) {
  const groups = await Group.find({ organizationId: req.user.organizationId, memberIds: req.user._id }).select('name description').sort({ name: 1 }).lean();
  res.json({ groups: groups.map((g) => ({ id: String(g._id), name: g.name, description: g.description })) });
}

// Students can post discussion messages and reply to top-level posts in their own groups. They cannot post announcements.
async function postToGroup(req, res) {
  const student = req.user;
  if (!isId(req.params.id)) throw new AppError(404, 'Group not found');
  const group = await Group.findOne({ _id: req.params.id, organizationId: student.organizationId, memberIds: student._id });
  if (!group) throw new AppError(404, 'Group not found');
  const { body, parentId } = req.body;
  if (parentId) {
    if (!isId(parentId)) throw new AppError(400, 'Invalid parent post');
    const parent = await GroupPost.findOne({ _id: parentId, organizationId: student.organizationId });
    assertValidReplyTarget(parent, group._id);
  }
  const post = await GroupPost.create({ organizationId: student.organizationId, groupId: group._id, authorId: student._id, kind: 'discussion', body, parentId: parentId || null });
  await recordAudit({ organizationId: student.organizationId, actorId: student._id, action: parentId ? 'group.reply' : 'group.discussion', targetType: 'group', targetId: group._id, summary: `Posted in ${group.name}` });
  res.status(201).json({ post: { id: String(post._id), body: post.body, createdAt: post.createdAt } });
}

module.exports = { schemas, listMyTasks, submitTask, listMyGroups, postToGroup, assignedFilter, myGroupIds };

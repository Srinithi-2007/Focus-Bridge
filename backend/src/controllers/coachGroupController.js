'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { isSafeUrl, assertValidReplyTarget } = require('../services/coachRules');
const { getOwnedGroup, isId } = require('../services/coachAccess');
const User = require('../models/User');
const Group = require('../models/Group');
const GroupPost = require('../models/GroupPost');
const GroupResource = require('../models/GroupResource');
const Activity = require('../models/Activity');
const Task = require('../models/Task');
const Program = require('../models/Program');
const { presentTask } = require('./coachTaskController');

const schemas = {
  post: z.object({
    kind: z.enum(['announcement', 'discussion']),
    body: z.string().trim().min(1).max(2000),
    parentId: z.string().regex(/^[a-f0-9]{24}$/).nullable().optional(),
  }),
  resource: z.object({
    title: z.string().trim().min(1).max(150),
    url: z.string().trim().max(2048).refine(isSafeUrl, 'Links must start with http:// or https://'),
  }),
};

function displayName(u) {
  return `${u.firstName} ${u.lastName}`.trim();
}

async function listGroups(req, res) {
  const coach = req.user;
  const groups = await Group.find({ organizationId: coach.organizationId, coachId: coach._id }).sort({ name: 1 }).lean();
  const programs = await Program.find({ organizationId: coach.organizationId }).select('name').lean();
  const pName = new Map(programs.map((p) => [String(p._id), p.name]));
  const now = new Date();
  const upcoming = await Activity.aggregate([
    { $match: { organizationId: coach.organizationId, coachId: coach._id, status: 'scheduled', startsAt: { $gte: now } } },
    { $group: { _id: '$groupId', count: { $sum: 1 } } },
  ]);
  const upMap = new Map(upcoming.map((u) => [String(u._id), u.count]));
  res.json({
    groups: groups.map((g) => ({
      id: String(g._id),
      name: g.name,
      description: g.description,
      memberCount: g.memberIds.length,
      programName: g.programId ? pName.get(String(g.programId)) || null : null,
      upcomingActivities: upMap.get(String(g._id)) || 0,
    })),
  });
}

async function getGroup(req, res) {
  const coach = req.user;
  const group = await getOwnedGroup(coach, req.params.id);
  const now = new Date();

  const [members, posts, resources, activities, tasks, program] = await Promise.all([
    User.find({ organizationId: coach.organizationId, _id: { $in: group.memberIds } }).select('firstName lastName email status').sort({ lastName: 1 }).lean(),
    GroupPost.find({ organizationId: coach.organizationId, groupId: group._id }).sort({ createdAt: -1 }).limit(200).lean(),
    GroupResource.find({ organizationId: coach.organizationId, groupId: group._id }).sort({ createdAt: -1 }).lean(),
    Activity.find({ organizationId: coach.organizationId, groupId: group._id, status: { $ne: 'cancelled' } }).sort({ startsAt: 1 }).limit(50).lean(),
    Task.find({ organizationId: coach.organizationId, coachId: coach._id, audience: 'group', groupId: group._id, status: { $ne: 'draft' } }).sort({ createdAt: -1 }).limit(50).lean(),
    group.programId ? Program.findById(group.programId).select('name').lean() : null,
  ]);

  const authorIds = [...new Set(posts.map((p) => String(p.authorId)))];
  const authors = await User.find({ _id: { $in: authorIds } }).select('firstName lastName role').lean();
  const authorName = new Map(authors.map((a) => [String(a._id), { name: displayName(a), role: a.role }]));

  const top = posts.filter((p) => !p.parentId);
  const repliesBy = new Map();
  for (const p of posts) {
    if (!p.parentId) continue;
    const k = String(p.parentId);
    if (!repliesBy.has(k)) repliesBy.set(k, []);
    repliesBy.get(k).unshift(p);
  }
  const present = (p) => ({
    id: String(p._id),
    kind: p.kind,
    body: p.deletedAt ? null : p.body,
    removed: Boolean(p.deletedAt),
    author: authorName.get(String(p.authorId)) || { name: 'Member', role: 'student' },
    createdAt: p.createdAt,
  });

  res.json({
    group: { id: String(group._id), name: group.name, description: group.description, programName: program ? program.name : null, memberCount: group.memberIds.length },
    members: members.map((m) => ({ id: String(m._id), name: displayName(m), email: m.email, status: m.status })),
    announcements: top.filter((p) => p.kind === 'announcement').map((p) => ({ ...present(p), replies: (repliesBy.get(String(p._id)) || []).map(present) })),
    discussions: top.filter((p) => p.kind === 'discussion').map((p) => ({ ...present(p), replies: (repliesBy.get(String(p._id)) || []).map(present) })),
    resources: resources.map((r) => ({ id: String(r._id), title: r.title, url: r.url, createdAt: r.createdAt })),
    activities: activities.map((a) => ({ id: String(a._id), title: a.title, startsAt: a.startsAt, endsAt: a.endsAt, status: a.status, upcoming: new Date(a.startsAt) >= now })),
    assignments: await Promise.all(tasks.map((t) => presentTask(coach, t))),
  });
}

async function createPost(req, res) {
  const coach = req.user;
  const group = await getOwnedGroup(coach, req.params.id);
  const { kind, body, parentId } = req.body;
  if (parentId) {
    if (!isId(parentId)) throw new AppError(400, 'Invalid parent post');
    const parent = await GroupPost.findOne({ _id: parentId, organizationId: coach.organizationId });
    assertValidReplyTarget(parent, group._id);
  }
  const post = await GroupPost.create({ organizationId: coach.organizationId, groupId: group._id, authorId: coach._id, kind, body, parentId: parentId || null });
  if (kind === 'announcement' && group.memberIds && group.memberIds.length > 0) {
    const { notify } = require('../services/notifications');
    await Promise.all(
      group.memberIds.map((uid) =>
        notify({
          organizationId: coach.organizationId,
          userId: uid,
          type: 'group',
          title: `Announcement in ${group.name}`,
          body: body.slice(0, 140),
          link: '/student/groups',
        })
      )
    );
  }
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: parentId ? 'group.reply' : `group.${kind}`, targetType: 'group', targetId: group._id, summary: `Posted in ${group.name}` });
  res.status(201).json({ post: { id: String(post._id), kind: post.kind, body: post.body, createdAt: post.createdAt } });
}

// Coaches can remove posts in their own group (moderation). Removal is a soft delete.
async function deletePost(req, res) {
  const coach = req.user;
  const group = await getOwnedGroup(coach, req.params.id);
  if (!isId(req.params.postId)) throw new AppError(404, 'Post not found');
  const post = await GroupPost.findOneAndUpdate(
    { _id: req.params.postId, organizationId: coach.organizationId, groupId: group._id, deletedAt: null },
    { deletedAt: new Date() },
    { returnDocument: 'after' }
  );
  if (!post) throw new AppError(404, 'Post not found');
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'group.post.remove', targetType: 'group', targetId: group._id, summary: `Removed a post in ${group.name}` });
  res.json({ message: 'Post removed' });
}

async function addResource(req, res) {
  const coach = req.user;
  const group = await getOwnedGroup(coach, req.params.id);
  const r = await GroupResource.create({ organizationId: coach.organizationId, groupId: group._id, uploaderId: coach._id, title: req.body.title, url: req.body.url });
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'group.resource.add', targetType: 'group', targetId: group._id, summary: `Shared resource "${r.title}" in ${group.name}` });
  res.status(201).json({ resource: { id: String(r._id), title: r.title, url: r.url, createdAt: r.createdAt } });
}

async function deleteResource(req, res) {
  const coach = req.user;
  const group = await getOwnedGroup(coach, req.params.id);
  if (!isId(req.params.resourceId)) throw new AppError(404, 'Resource not found');
  const result = await GroupResource.deleteOne({ _id: req.params.resourceId, organizationId: coach.organizationId, groupId: group._id });
  if (!result.deletedCount) throw new AppError(404, 'Resource not found');
  res.json({ message: 'Resource removed' });
}

module.exports = { schemas, listGroups, getGroup, createPost, deletePost, addResource, deleteResource };

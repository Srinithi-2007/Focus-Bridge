'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { assertActivityTimes, assertCanCompleteActivity, assertCanCancelActivity } = require('../services/coachRules');
const { getOwnedGroup, isId } = require('../services/coachAccess');
const Activity = require('../models/Activity');
const Group = require('../models/Group');

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const isoDate = z.string().datetime({ offset: true });
const base = {
  groupId: objectId,
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000).default(''),
  location: z.string().trim().max(200).default(''),
  startsAt: isoDate,
  endsAt: isoDate,
};

const schemas = {
  createActivity: z.object(base),
  updateActivity: z
    .object({
      title: base.title,
      description: base.description,
      location: base.location,
      startsAt: isoDate,
      endsAt: isoDate,
    })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update'),
  listActivities: z.object({
    status: z.enum(['scheduled', 'completed', 'cancelled', 'all']).optional(),
    groupId: objectId.optional(),
  }),
};

function present(a, groupName) {
  return {
    id: String(a._id),
    groupId: String(a.groupId),
    groupName,
    title: a.title,
    description: a.description,
    location: a.location,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    status: a.status,
    completedAt: a.completedAt,
    cancelledAt: a.cancelledAt,
  };
}

async function groupNames(orgId, ids) {
  const groups = await Group.find({ organizationId: orgId, _id: { $in: ids } }).select('name').lean();
  return new Map(groups.map((g) => [String(g._id), g.name]));
}

async function getOwnedActivity(coach, id) {
  if (!isId(id)) throw new AppError(404, 'Activity not found');
  const a = await Activity.findOne({ _id: id, organizationId: coach.organizationId, coachId: coach._id });
  if (!a) throw new AppError(404, 'Activity not found');
  return a;
}

async function listActivities(req, res) {
  const coach = req.user;
  const filter = { organizationId: coach.organizationId, coachId: coach._id };
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.groupId) {
    await getOwnedGroup(coach, req.query.groupId);
    filter.groupId = req.query.groupId;
  }
  const items = await Activity.find(filter).sort({ startsAt: 1 }).limit(500).lean();
  const names = await groupNames(coach.organizationId, [...new Set(items.map((i) => String(i.groupId)))]);
  res.json({ activities: items.map((a) => present(a, names.get(String(a.groupId)) || '')) });
}

async function createActivity(req, res) {
  const coach = req.user;
  const group = await getOwnedGroup(coach, req.body.groupId);
  assertActivityTimes({ startsAt: req.body.startsAt, endsAt: req.body.endsAt }, new Date(), { requireFuture: true });
  const a = await Activity.create({
    organizationId: coach.organizationId,
    coachId: coach._id,
    groupId: group._id,
    title: req.body.title,
    description: req.body.description,
    location: req.body.location,
    startsAt: req.body.startsAt,
    endsAt: req.body.endsAt,
  });
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'activity.create', targetType: 'activity', targetId: a._id, summary: `Scheduled "${a.title}" for ${group.name}` });
  res.status(201).json({ activity: present(a, group.name) });
}

async function updateActivity(req, res) {
  const coach = req.user;
  const a = await getOwnedActivity(coach, req.params.id);
  if (a.status !== 'scheduled') throw new AppError(409, 'Only scheduled activities can be edited');
  const next = {
    startsAt: req.body.startsAt ?? a.startsAt,
    endsAt: req.body.endsAt ?? a.endsAt,
  };
  if (req.body.startsAt !== undefined || req.body.endsAt !== undefined) {
    assertActivityTimes(next, new Date(), { requireFuture: true });
  }
  for (const k of ['title', 'description', 'location', 'startsAt', 'endsAt']) {
    if (req.body[k] !== undefined) a[k] = req.body[k];
  }
  await a.save();
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'activity.update', targetType: 'activity', targetId: a._id, summary: `Updated activity "${a.title}"` });
  const names = await groupNames(coach.organizationId, [a.groupId]);
  res.json({ activity: present(a, names.get(String(a.groupId)) || '') });
}

async function completeActivity(req, res) {
  const coach = req.user;
  const a = await getOwnedActivity(coach, req.params.id);
  assertCanCompleteActivity(a);
  a.status = 'completed';
  a.completedAt = new Date();
  await a.save();
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'activity.complete', targetType: 'activity', targetId: a._id, summary: `Completed "${a.title}"` });
  const names = await groupNames(coach.organizationId, [a.groupId]);
  res.json({ activity: present(a, names.get(String(a.groupId)) || '') });
}

async function cancelActivity(req, res) {
  const coach = req.user;
  const a = await getOwnedActivity(coach, req.params.id);
  assertCanCancelActivity(a);
  a.status = 'cancelled';
  a.cancelledAt = new Date();
  await a.save();
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'activity.cancel', targetType: 'activity', targetId: a._id, summary: `Cancelled "${a.title}"` });
  const names = await groupNames(coach.organizationId, [a.groupId]);
  res.json({ activity: present(a, names.get(String(a.groupId)) || '') });
}

module.exports = { schemas, listActivities, createActivity, updateActivity, completeActivity, cancelActivity };

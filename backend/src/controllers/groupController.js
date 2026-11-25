'use strict';
const { z } = require('zod');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { assertActiveCoach, assertActiveStudent } = require('../services/rules');
const User = require('../models/User');
const Group = require('../models/Group');
const Program = require('../models/Program');

const objectId = z.string().regex(/^[a-f0-9]{24}$/);

const schemas = {
  createGroup: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional().default(''),
    coachId: objectId.nullable().optional(),
    programId: objectId.nullable().optional(),
  }),
  updateGroup: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(1000).optional(),
      coachId: objectId.nullable().optional(),
      programId: objectId.nullable().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update'),
  addMembers: z.object({
    studentIds: z.array(objectId).min(1).max(100),
  }),
};

// Validates an optional coach/program reference and returns the value to store.
async function resolveRefs(orgId, { coachId, programId }) {
  const out = {};
  if (coachId !== undefined) {
    if (coachId === null) out.coachId = null;
    else {
      const coach = await User.findOne({ _id: coachId, organizationId: orgId });
      if (!coach) throw new AppError(400, 'Coach not found in this organization');
      assertActiveCoach(coach);
      out.coachId = coach._id;
    }
  }
  if (programId !== undefined) {
    if (programId === null) out.programId = null;
    else {
      const program = await Program.findOne({ _id: programId, organizationId: orgId });
      if (!program) throw new AppError(400, 'Program not found in this organization');
      out.programId = program._id;
    }
  }
  return out;
}

async function findGroup(req, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Group not found');
  const group = await Group.findOne({ _id: id, organizationId: req.organizationId });
  if (!group) throw new AppError(404, 'Group not found');
  return group;
}

// Builds the same shape for list and detail views.
async function present(orgId, groups, { withMembers = false } = {}) {
  const coachIds = groups.map((g) => g.coachId).filter(Boolean);
  const programIds = groups.map((g) => g.programId).filter(Boolean);
  const memberIds = withMembers ? groups.flatMap((g) => g.memberIds) : [];
  const [coaches, programs, members] = await Promise.all([
    User.find({ organizationId: orgId, _id: { $in: coachIds } }).select('firstName lastName status').lean(),
    Program.find({ organizationId: orgId, _id: { $in: programIds } }).select('name').lean(),
    withMembers ? User.find({ organizationId: orgId, _id: { $in: memberIds } }).select('firstName lastName email status').lean() : [],
  ]);
  const coachMap = new Map(coaches.map((c) => [c._id.toString(), c]));
  const programMap = new Map(programs.map((p) => [p._id.toString(), p]));
  const memberMap = new Map(members.map((m) => [m._id.toString(), m]));

  return groups.map((g) => {
    const coach = g.coachId ? coachMap.get(g.coachId.toString()) : null;
    const program = g.programId ? programMap.get(g.programId.toString()) : null;
    const base = {
      id: g._id.toString(),
      name: g.name,
      description: g.description,
      memberCount: g.memberIds.length,
      coach: coach ? { id: coach._id.toString(), name: `${coach.firstName} ${coach.lastName}`.trim(), status: coach.status } : null,
      program: program ? { id: program._id.toString(), name: program.name } : null,
    };
    if (withMembers) {
      base.members = g.memberIds
        .map((id) => memberMap.get(id.toString()))
        .filter(Boolean)
        .map((m) => ({ id: m._id.toString(), name: `${m.firstName} ${m.lastName}`.trim(), email: m.email, status: m.status }));
    }
    return base;
  });
}

async function listGroups(req, res) {
  const groups = await Group.find({ organizationId: req.organizationId }).sort({ name: 1 }).limit(300);
  res.json({ groups: await present(req.organizationId, groups) });
}

async function getGroup(req, res) {
  const group = await findGroup(req, req.params.id);
  const [view] = await present(req.organizationId, [group], { withMembers: true });
  res.json({ group: view });
}

async function createGroup(req, res) {
  const orgId = req.organizationId;
  const refs = await resolveRefs(orgId, { coachId: req.body.coachId, programId: req.body.programId });
  if (await Group.exists({ organizationId: orgId, name: req.body.name })) {
    throw new AppError(409, 'A group with this name already exists');
  }
  const group = await Group.create({ organizationId: orgId, name: req.body.name, description: req.body.description, ...refs });
  await recordAudit({ organizationId: orgId, actorId: req.user._id, action: 'group.create', targetType: 'group', targetId: group._id, summary: `Created group ${group.name}` });
  const [view] = await present(orgId, [group]);
  res.status(201).json({ group: view });
}

async function updateGroup(req, res) {
  const group = await findGroup(req, req.params.id);
  const orgId = req.organizationId;
  const { name, description, coachId, programId } = req.body;
  if (name && name !== group.name) {
    if (await Group.exists({ organizationId: orgId, name, _id: { $ne: group._id } })) throw new AppError(409, 'A group with this name already exists');
    group.name = name;
  }
  if (description !== undefined) group.description = description;
  Object.assign(group, await resolveRefs(orgId, { coachId, programId }));
  await group.save();
  await recordAudit({ organizationId: orgId, actorId: req.user._id, action: 'group.update', targetType: 'group', targetId: group._id, summary: `Updated group ${group.name}` });
  const [view] = await present(orgId, [group]);
  res.json({ group: view });
}

async function deleteGroup(req, res) {
  const group = await findGroup(req, req.params.id);
  await Group.deleteOne({ _id: group._id, organizationId: req.organizationId });
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'group.delete', targetType: 'group', targetId: group._id, summary: `Deleted group ${group.name}` });
  res.json({ message: 'Group deleted' });
}

// Adds active students. Students already in the group are skipped and reported, not duplicated.
async function addMembers(req, res) {
  const group = await findGroup(req, req.params.id);
  const orgId = req.organizationId;
  const requested = [...new Set(req.body.studentIds)];
  const students = await User.find({ organizationId: orgId, _id: { $in: requested } });
  if (students.length !== requested.length) throw new AppError(400, 'One or more students were not found in this organization');
  for (const s of students) assertActiveStudent(s);

  const existing = new Set(group.memberIds.map((id) => id.toString()));
  const toAdd = requested.filter((id) => !existing.has(id));
  if (group.memberIds.length + toAdd.length > Group.MAX_MEMBERS) {
    throw new AppError(400, `A group can have at most ${Group.MAX_MEMBERS} members`);
  }
  if (toAdd.length) {
    group.memberIds.push(...toAdd.map((id) => new mongoose.Types.ObjectId(id)));
    await group.save();
    await recordAudit({ organizationId: orgId, actorId: req.user._id, action: 'group.members.add', targetType: 'group', targetId: group._id, summary: `Added ${toAdd.length} student(s) to ${group.name}` });
  }
  const [view] = await present(orgId, [group], { withMembers: true });
  res.json({ added: toAdd.length, skipped: requested.length - toAdd.length, group: view });
}

async function removeMember(req, res) {
  const group = await findGroup(req, req.params.id);
  const studentId = req.params.studentId;
  if (!mongoose.isValidObjectId(studentId)) throw new AppError(400, 'Invalid student id');
  const before = group.memberIds.length;
  group.memberIds = group.memberIds.filter((id) => id.toString() !== studentId);
  if (group.memberIds.length === before) throw new AppError(404, 'Student is not a member of this group');
  await group.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'group.members.remove', targetType: 'group', targetId: group._id, summary: `Removed a student from ${group.name}` });
  const [view] = await present(req.organizationId, [group], { withMembers: true });
  res.json({ group: view });
}

module.exports = { schemas, listGroups, getGroup, createGroup, updateGroup, deleteGroup, addMembers, removeMember };

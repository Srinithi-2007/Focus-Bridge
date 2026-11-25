'use strict';
const { z } = require('zod');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const User = require('../models/User');
const Group = require('../models/Group');
const Program = require('../models/Program');

const schemas = {
  programBody: z.object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional().default(''),
    coachingAreas: z.array(z.string().trim().min(1).max(60)).max(12).optional().default([]),
  }),
  updateProgram: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().trim().max(1000).optional(),
      coachingAreas: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update'),
};

async function findProgram(req, id) {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Program not found');
  const program = await Program.findOne({ _id: id, organizationId: req.organizationId });
  if (!program) throw new AppError(404, 'Program not found');
  return program;
}

// Returns each program with how many students and groups currently use it.
async function listPrograms(req, res) {
  const orgId = req.organizationId;
  const programs = await Program.find({ organizationId: orgId }).sort({ name: 1 }).lean();
  const ids = programs.map((p) => p._id);
  const [studentCounts, groupCounts] = await Promise.all([
    User.aggregate([{ $match: { organizationId: new mongoose.Types.ObjectId(orgId), role: 'student', programId: { $in: ids } } }, { $group: { _id: '$programId', count: { $sum: 1 } } }]),
    Group.aggregate([{ $match: { organizationId: new mongoose.Types.ObjectId(orgId), programId: { $in: ids } } }, { $group: { _id: '$programId', count: { $sum: 1 } } }]),
  ]);
  const sMap = new Map(studentCounts.map((x) => [x._id.toString(), x.count]));
  const gMap = new Map(groupCounts.map((x) => [x._id.toString(), x.count]));
  res.json({
    programs: programs.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      description: p.description,
      coachingAreas: p.coachingAreas,
      studentCount: sMap.get(p._id.toString()) || 0,
      groupCount: gMap.get(p._id.toString()) || 0,
    })),
  });
}

async function createProgram(req, res) {
  const orgId = req.organizationId;
  if (await Program.exists({ organizationId: orgId, name: req.body.name })) throw new AppError(409, 'A program with this name already exists');
  const program = await Program.create({ organizationId: orgId, ...req.body });
  await recordAudit({ organizationId: orgId, actorId: req.user._id, action: 'program.create', targetType: 'program', targetId: program._id, summary: `Created program ${program.name}` });
  res.status(201).json({ program: { id: program._id.toString(), name: program.name, description: program.description, coachingAreas: program.coachingAreas } });
}

async function updateProgram(req, res) {
  const program = await findProgram(req, req.params.id);
  if (req.body.name && req.body.name !== program.name) {
    if (await Program.exists({ organizationId: req.organizationId, name: req.body.name, _id: { $ne: program._id } })) {
      throw new AppError(409, 'A program with this name already exists');
    }
  }
  Object.assign(program, req.body);
  await program.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'program.update', targetType: 'program', targetId: program._id, summary: `Updated program ${program.name}` });
  res.json({ program: { id: program._id.toString(), name: program.name, description: program.description, coachingAreas: program.coachingAreas } });
}

// A program that is still used by students or groups cannot be deleted, to avoid orphaned enrollments.
async function deleteProgram(req, res) {
  const program = await findProgram(req, req.params.id);
  const [students, groups] = await Promise.all([
    User.countDocuments({ organizationId: req.organizationId, programId: program._id }),
    Group.countDocuments({ organizationId: req.organizationId, programId: program._id }),
  ]);
  if (students || groups) {
    throw new AppError(409, `This program is in use by ${students} student(s) and ${groups} group(s). Reassign them before deleting.`);
  }
  await Program.deleteOne({ _id: program._id, organizationId: req.organizationId });
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'program.delete', targetType: 'program', targetId: program._id, summary: `Deleted program ${program.name}` });
  res.json({ message: 'Program deleted' });
}

module.exports = { schemas, listPrograms, createProgram, updateProgram, deleteProgram };

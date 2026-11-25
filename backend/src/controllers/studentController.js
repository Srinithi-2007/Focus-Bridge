'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { escapeRegex, clampPagination } = require('../services/rules');
const { findOrgUser } = require('./adminController');
const User = require('../models/User');
const Group = require('../models/Group');
const Invitation = require('../models/Invitation');
const Program = require('../models/Program');

const schemas = {
  listStudents: z.object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(['invited', 'active', 'deactivated']).optional(),
    programId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
    coachId: z.union([z.string().regex(/^[a-f0-9]{24}$/), z.literal('none')]).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
  updateStudent: z
    .object({
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().min(1).max(80).optional(),
      email: z.string().trim().toLowerCase().email().max(254).optional(),
      programId: z.string().regex(/^[a-f0-9]{24}$/).nullable().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update'),
};

// Lists students with program, coach and group information. Invited students appear with their pending invitation.
async function listStudents(req, res) {
  const orgId = req.organizationId;
  const { search, status, programId, coachId } = req.query;
  const { page, limit, skip } = clampPagination(req.query);

  const filter = { organizationId: orgId, role: 'student' };
  if (status) filter.status = status;
  if (programId) filter.programId = programId;
  if (coachId === 'none') filter.coachId = null;
  else if (coachId) filter.coachId = coachId;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
  }

  const [total, students] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ lastName: 1, firstName: 1 }).skip(skip).limit(limit),
  ]);

  const ids = students.map((s) => s._id);
  const [groups, programs, coaches, invites] = await Promise.all([
    Group.find({ organizationId: orgId, memberIds: { $in: ids } }).select('name memberIds').lean(),
    Program.find({ organizationId: orgId }).select('name').lean(),
    User.find({ organizationId: orgId, role: 'coach' }).select('firstName lastName status').lean(),
    Invitation.find({ organizationId: orgId, role: 'student', acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() }, email: { $in: students.map((s) => s.email) } }).select('email').lean(),
  ]);

  const programName = new Map(programs.map((p) => [p._id.toString(), p.name]));
  const coachById = new Map(coaches.map((c) => [c._id.toString(), c]));
  const pendingEmails = new Set(invites.map((i) => i.email));

  res.json({
    page,
    limit,
    total,
    students: students.map((s) => {
      const coach = s.coachId ? coachById.get(s.coachId.toString()) : null;
      return {
        ...s.toSafeJSON(),
        programName: s.programId ? programName.get(s.programId.toString()) || null : null,
        coach: coach ? { id: coach._id.toString(), name: `${coach.firstName} ${coach.lastName}`.trim(), status: coach.status } : null,
        groups: groups.filter((g) => g.memberIds.some((m) => m.equals(s._id))).map((g) => ({ id: g._id.toString(), name: g.name })),
        hasOpenInvitation: pendingEmails.has(s.email),
      };
    }),
  });
}

async function updateStudent(req, res) {
  const student = await findOrgUser(req, req.params.id);
  if (student.role !== 'student') throw new AppError(400, 'Selected user is not a student');
  const { firstName, lastName, email, programId } = req.body;

  if (email && email !== student.email) {
    if (await User.exists({ email })) throw new AppError(409, 'An account with this email already exists');
    student.email = email;
  }
  if (firstName !== undefined) student.firstName = firstName;
  if (lastName !== undefined) student.lastName = lastName;
  if (programId !== undefined) {
    if (programId === null) {
      student.programId = null;
    } else {
      const program = await Program.findOne({ _id: programId, organizationId: req.organizationId });
      if (!program) throw new AppError(400, 'Program not found in this organization');
      student.programId = program._id;
    }
  }
  await student.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'student.update', targetType: 'user', targetId: student._id, summary: `Updated student ${student.email}` });
  res.json({ user: student.toSafeJSON() });
}

module.exports = { schemas, listStudents, updateStudent };

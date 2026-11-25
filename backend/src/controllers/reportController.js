'use strict';
const { z } = require('zod');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { parseDateRange, toCsv } = require('../services/rules');
const User = require('../models/User');
const Group = require('../models/Group');
const Program = require('../models/Program');
const Invitation = require('../models/Invitation');

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const schemas = {
  range: z.object({
    from: z.string().regex(dateRegex).optional(),
    to: z.string().regex(dateRegex).optional(),
  }),
  export: z.object({
    type: z.enum(['students', 'coaches', 'groups', 'invitations']),
    from: z.string().regex(dateRegex).optional(),
    to: z.string().regex(dateRegex).optional(),
  }),
};

function fullName(u) {
  return u ? `${u.firstName} ${u.lastName}`.trim() : '';
}

// Organization-level analytics. Aggregates only: no individual rankings and no diagnosis-based categories.
async function buildReport(orgId, from, to) {
  const { start, end } = parseDateRange(from, to);
  const oid = new mongoose.Types.ObjectId(orgId);

  const [statusCounts, programCounts, unassigned, coaches, groups, invitesCreated, invitesAccepted, invitesRevoked, monthly, programs] = await Promise.all([
    User.aggregate([{ $match: { organizationId: oid, role: 'student' } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    User.aggregate([{ $match: { organizationId: oid, role: 'student', status: 'active' } }, { $group: { _id: '$programId', count: { $sum: 1 } } }]),
    User.countDocuments({ organizationId: orgId, role: 'student', status: 'active', coachId: null }),
    User.find({ organizationId: orgId, role: 'coach' }).select('firstName lastName status').lean(),
    Group.find({ organizationId: orgId }).select('name coachId programId memberIds').lean(),
    Invitation.countDocuments({ organizationId: orgId, createdAt: { $gte: start, $lt: end } }),
    Invitation.countDocuments({ organizationId: orgId, acceptedAt: { $gte: start, $lt: end } }),
    Invitation.countDocuments({ organizationId: orgId, revokedAt: { $gte: start, $lt: end } }),
    User.aggregate([
      { $match: { organizationId: oid, role: { $in: ['coach', 'student'] }, createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, role: '$role' }, count: { $sum: 1 } } },
      { $sort: { '_id.month': 1 } },
    ]),
    Program.find({ organizationId: orgId }).select('name').lean(),
  ]);

  const status = Object.fromEntries(['invited', 'active', 'deactivated'].map((s) => [s, 0]));
  for (const row of statusCounts) status[row._id] = row.count;

  const programName = new Map(programs.map((p) => [p._id.toString(), p.name]));
  const byProgram = programCounts.map((row) => ({
    program: row._id ? programName.get(row._id.toString()) || 'Unknown program' : 'No program',
    count: row.count,
  }));

  const groupsByCoach = new Map();
  const studentsByCoachAgg = await User.aggregate([
    { $match: { organizationId: oid, role: 'student', status: 'active', coachId: { $ne: null } } },
    { $group: { _id: '$coachId', count: { $sum: 1 } } },
  ]);
  const studentsByCoach = new Map(studentsByCoachAgg.map((r) => [r._id.toString(), r.count]));
  for (const g of groups) {
    if (g.coachId) groupsByCoach.set(g.coachId.toString(), (groupsByCoach.get(g.coachId.toString()) || 0) + 1);
  }

  const monthlyMap = new Map();
  for (const row of monthly) {
    const m = monthlyMap.get(row._id.month) || { month: row._id.month, coach: 0, student: 0 };
    m[row._id.role] = row.count;
    monthlyMap.set(row._id.month, m);
  }

  return {
    range: { from: start.toISOString().slice(0, 10), to: new Date(end.getTime() - 86400000).toISOString().slice(0, 10) },
    students: { active: status.active, invited: status.invited, deactivated: status.deactivated, unassignedActive: unassigned, byProgram },
    coaches: {
      active: coaches.filter((c) => c.status === 'active').length,
      pending: coaches.filter((c) => c.status === 'pending_approval').length,
      load: coaches.map((c) => ({
        name: fullName(c),
        status: c.status,
        studentCount: studentsByCoach.get(c._id.toString()) || 0,
        groupCount: groupsByCoach.get(c._id.toString()) || 0,
      })),
    },
    groups: groups.map((g) => ({ name: g.name, memberCount: g.memberIds.length })),
    invitations: { created: invitesCreated, accepted: invitesAccepted, revoked: invitesRevoked },
    monthlyAccounts: [...monthlyMap.values()],
    // Task analytics need the Phase 3 task models. Reported explicitly rather than faked.
    tasks: { available: false, message: 'Task and completion trends appear after coaches begin assigning tasks (Phase 3).' },
  };
}

async function getReports(req, res) {
  const report = await buildReport(req.organizationId, req.query.from, req.query.to);
  res.json({ report });
}

async function exportReport(req, res) {
  const orgId = req.organizationId;
  const { type, from, to } = req.query;
  const { start, end } = parseDateRange(from, to);
  let csv;

  if (type === 'students') {
    const [students, programs, coaches, groups] = await Promise.all([
      User.find({ organizationId: orgId, role: 'student', createdAt: { $gte: start, $lt: end } }).sort({ lastName: 1 }).lean(),
      Program.find({ organizationId: orgId }).select('name').lean(),
      User.find({ organizationId: orgId, role: 'coach' }).select('firstName lastName').lean(),
      Group.find({ organizationId: orgId }).select('name memberIds').lean(),
    ]);
    const programName = new Map(programs.map((p) => [p._id.toString(), p.name]));
    const coachName = new Map(coaches.map((c) => [c._id.toString(), fullName(c)]));
    csv = toCsv(
      ['First name', 'Last name', 'Email', 'Status', 'Program', 'Coach', 'Groups', 'Created'],
      students.map((s) => [
        s.firstName,
        s.lastName,
        s.email,
        s.status,
        s.programId ? programName.get(s.programId.toString()) || '' : '',
        s.coachId ? coachName.get(s.coachId.toString()) || '' : '',
        groups.filter((g) => g.memberIds.some((m) => m.equals(s._id))).map((g) => g.name).join('; '),
        s.createdAt,
      ])
    );
  } else if (type === 'coaches') {
    const report = await buildReport(orgId, from, to);
    csv = toCsv(
      ['Name', 'Status', 'Active students', 'Groups'],
      report.coaches.load.map((c) => [c.name, c.status, c.studentCount, c.groupCount])
    );
  } else if (type === 'groups') {
    const [groups, coaches, programs] = await Promise.all([
      Group.find({ organizationId: orgId }).sort({ name: 1 }).lean(),
      User.find({ organizationId: orgId, role: 'coach' }).select('firstName lastName').lean(),
      Program.find({ organizationId: orgId }).select('name').lean(),
    ]);
    const coachName = new Map(coaches.map((c) => [c._id.toString(), fullName(c)]));
    const programName = new Map(programs.map((p) => [p._id.toString(), p.name]));
    csv = toCsv(
      ['Group', 'Coach', 'Program', 'Members'],
      groups.map((g) => [g.name, g.coachId ? coachName.get(g.coachId.toString()) || '' : '', g.programId ? programName.get(g.programId.toString()) || '' : '', g.memberIds.length])
    );
  } else {
    const invitations = await Invitation.find({ organizationId: orgId, createdAt: { $gte: start, $lt: end } }).sort({ createdAt: -1 }).lean();
    const now = new Date();
    csv = toCsv(
      ['Email', 'Role', 'State', 'Sent', 'Expires'],
      invitations.map((i) => [
        i.email,
        i.role,
        i.revokedAt ? 'revoked' : i.acceptedAt ? 'accepted' : i.expiresAt <= now ? 'expired' : 'open',
        i.createdAt,
        i.expiresAt,
      ])
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="focusbridge-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}

module.exports = { schemas, getReports, exportReport };

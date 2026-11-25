'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { assertActiveCoach, assertActiveStudent } = require('../services/rules');
const { findOrgUser } = require('./adminController');
const User = require('../models/User');

const schemas = {
  assignCoach: z.object({
    coachId: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  }),
};

// Returns coaches with load, and students with their current coach. Used by the allocations screen.
async function getAllocations(req, res) {
  const orgId = req.organizationId;
  const [coaches, students] = await Promise.all([
    User.find({ organizationId: orgId, role: 'coach' }).sort({ lastName: 1, firstName: 1 }).lean(),
    User.find({ organizationId: orgId, role: 'student', status: { $in: ['active', 'invited'] } }).sort({ lastName: 1, firstName: 1 }).lean(),
  ]);

  const coachById = new Map(coaches.map((c) => [c._id.toString(), c]));
  const load = new Map();
  for (const s of students) {
    if (s.coachId) load.set(s.coachId.toString(), (load.get(s.coachId.toString()) || 0) + 1);
  }

  res.json({
    coaches: coaches.map((c) => ({
      id: c._id.toString(),
      name: `${c.firstName} ${c.lastName}`.trim(),
      email: c.email,
      status: c.status,
      studentCount: load.get(c._id.toString()) || 0,
    })),
    students: students.map((s) => {
      const coach = s.coachId ? coachById.get(s.coachId.toString()) : null;
      return {
        id: s._id.toString(),
        name: `${s.firstName} ${s.lastName}`.trim(),
        email: s.email,
        status: s.status,
        coach: coach
          ? { id: coach._id.toString(), name: `${coach.firstName} ${coach.lastName}`.trim(), status: coach.status }
          : null,
      };
    }),
  });
}

// Sets (or clears) a student's coach. Only active students can be allocated, and only to active coaches.
async function assignCoach(req, res) {
  const student = await findOrgUser(req, req.params.id);
  assertActiveStudent(student);

  const previousCoachId = student.coachId ? student.coachId.toString() : null;
  const nextCoachId = req.body.coachId;

  if (nextCoachId === null) {
    student.coachId = null;
  } else {
    if (nextCoachId === previousCoachId) return res.json({ user: student.toSafeJSON() });
    const coach = await User.findOne({ _id: nextCoachId, organizationId: req.organizationId });
    if (!coach) throw new AppError(400, 'Coach not found in this organization');
    assertActiveCoach(coach);
    student.coachId = coach._id;
  }

  await student.save();
  await recordAudit({
    organizationId: req.organizationId,
    actorId: req.user._id,
    action: 'allocation.assign',
    targetType: 'user',
    targetId: student._id,
    summary: nextCoachId ? `Assigned ${student.email} to a coach` : `Removed coach from ${student.email}`,
  });
  res.json({ user: student.toSafeJSON() });
}

module.exports = { schemas, getAllocations, assignCoach };

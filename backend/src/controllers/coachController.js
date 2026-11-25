'use strict';
const { z } = require('zod');
const { escapeRegex } = require('../services/rules');
const User = require('../models/User');
const Group = require('../models/Group');

const schemas = {
  listCoaches: z.object({
    search: z.string().trim().max(100).optional(),
    status: z.enum(['pending_approval', 'active', 'deactivated']).optional(),
  }),
};

// Coaches with load information: how many students and groups they are assigned.
async function listCoaches(req, res) {
  const orgId = req.organizationId;
  const filter = { organizationId: orgId, role: 'coach' };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
  }
  const coaches = await User.find(filter).sort({ lastName: 1, firstName: 1 }).limit(300);
  const ids = coaches.map((c) => c._id);

  const [studentCounts, groups] = await Promise.all([
    User.aggregate([
      { $match: { organizationId: orgId, role: 'student', coachId: { $in: ids } } },
      { $group: { _id: '$coachId', count: { $sum: 1 } } },
    ]),
    Group.find({ organizationId: orgId, coachId: { $in: ids } }).select('coachId').lean(),
  ]);
  const studentsBy = new Map(studentCounts.map((s) => [s._id.toString(), s.count]));
  const groupsBy = new Map();
  for (const g of groups) groupsBy.set(g.coachId.toString(), (groupsBy.get(g.coachId.toString()) || 0) + 1);

  res.json({
    coaches: coaches.map((c) => ({
      ...c.toSafeJSON(),
      studentCount: studentsBy.get(c._id.toString()) || 0,
      groupCount: groupsBy.get(c._id.toString()) || 0,
    })),
  });
}

module.exports = { schemas, listCoaches };

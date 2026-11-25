'use strict';
const User = require('../models/User');
const Group = require('../models/Group');
const Program = require('../models/Program');
const Invitation = require('../models/Invitation');
const AuditLog = require('../models/AuditLog');

// Overview metrics for the admin executive dashboard. All counts are scoped to the admin's organization.
async function getDashboard(req, res) {
  const orgId = req.organizationId;
  const now = new Date();
  const openInvitationFilter = { organizationId: orgId, acceptedAt: null, revokedAt: null, expiresAt: { $gt: now } };

  const [
    activeStudents,
    invitedStudents,
    unassignedStudents,
    activeCoaches,
    pendingCoaches,
    groupCount,
    programCount,
    openInvitations,
    pendingCoachList,
    openInvitationList,
    topGroups,
    activity,
  ] = await Promise.all([
    User.countDocuments({ organizationId: orgId, role: 'student', status: 'active' }),
    User.countDocuments({ organizationId: orgId, role: 'student', status: 'invited' }),
    User.countDocuments({ organizationId: orgId, role: 'student', status: 'active', coachId: null }),
    User.countDocuments({ organizationId: orgId, role: 'coach', status: 'active' }),
    User.countDocuments({ organizationId: orgId, role: 'coach', status: 'pending_approval' }),
    Group.countDocuments({ organizationId: orgId }),
    Program.countDocuments({ organizationId: orgId }),
    Invitation.countDocuments(openInvitationFilter),
    User.find({ organizationId: orgId, role: 'coach', status: 'pending_approval' }).sort({ createdAt: 1 }).limit(5).lean(),
    Invitation.find(openInvitationFilter).sort({ createdAt: -1 }).limit(5).lean(),
    Group.find({ organizationId: orgId }).sort({ updatedAt: -1 }).limit(5).select('name memberIds').lean(),
    AuditLog.find({ organizationId: orgId }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const actorIds = [...new Set(activity.map((a) => a.actorId.toString()))];
  const actors = await User.find({ organizationId: orgId, _id: { $in: actorIds } }).select('firstName lastName').lean();
  const actorName = new Map(actors.map((a) => [a._id.toString(), `${a.firstName} ${a.lastName}`.trim()]));

  res.json({
    metrics: {
      activeStudents,
      invitedStudents,
      unassignedStudents,
      activeCoaches,
      pendingCoaches,
      groupCount,
      programCount,
      openInvitations,
    },
    pendingCoaches: pendingCoachList.map((c) => ({ id: c._id.toString(), name: `${c.firstName} ${c.lastName}`.trim(), email: c.email, createdAt: c.createdAt })),
    openInvitations: openInvitationList.map((i) => ({ id: i._id.toString(), email: i.email, role: i.role, expiresAt: i.expiresAt })),
    groups: topGroups.map((g) => ({ id: g._id.toString(), name: g.name, memberCount: g.memberIds.length })),
    recentActivity: activity.map((a) => ({
      id: a._id.toString(),
      action: a.action,
      summary: a.summary,
      actor: actorName.get(a.actorId.toString()) || 'Administrator',
      createdAt: a.createdAt,
    })),
  });
}

module.exports = { getDashboard };

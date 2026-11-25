'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { parseDateRange, toCsv } = require('../services/rules');
const { allocatedStudentIds, getOwnedGroup, isId } = require('../services/coachAccess');
const { buildProgress, summarize } = require('../services/progress');
const { lastReviewMap, REVIEW_INTERVAL_MS } = require('./coachStudentController');
const User = require('../models/User');
const Group = require('../models/Group');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const Review = require('../models/Review');
const Activity = require('../models/Activity');
const AuditLog = require('../models/AuditLog');

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const schemas = {
  reports: z.object({
    from: z.string().regex(dateRegex).optional(),
    to: z.string().regex(dateRegex).optional(),
    groupId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  }),
  export: z.object({
    type: z.enum(['students', 'groups', 'activities']),
    from: z.string().regex(dateRegex).optional(),
    to: z.string().regex(dateRegex).optional(),
    groupId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
  }),
};

async function getDashboard(req, res) {
  const coach = req.user;
  const orgId = coach.organizationId;
  const now = new Date();
  const studentIds = await allocatedStudentIds(coach);
  const myTasks = await Task.find({ organizationId: orgId, coachId: coach._id, status: 'published' }).select('_id').lean();
  const taskIds = myTasks.map((t) => t._id);

  const [students, groupCount, progress, lastReviews, pendingFeedback, upcoming, activity] = await Promise.all([
    User.find({ organizationId: orgId, _id: { $in: studentIds } }).select('firstName lastName email status').sort({ lastName: 1, firstName: 1 }).lean(),
    Group.countDocuments({ organizationId: orgId, coachId: coach._id }),
    buildProgress({ organizationId: orgId, coachId: coach._id, studentIds, now }),
    lastReviewMap(orgId, coach._id, studentIds),
    Submission.countDocuments({ organizationId: orgId, taskId: { $in: taskIds }, status: 'submitted' }),
    Activity.find({ organizationId: orgId, coachId: coach._id, status: 'scheduled', startsAt: { $gte: now } }).sort({ startsAt: 1 }).limit(5).lean(),
    AuditLog.find({ organizationId: orgId, actorId: coach._id }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  let openTasks = 0;
  const rosterRows = students.map((s) => {
    const stat = summarize(progress.get(String(s._id)) || { assigned: new Map(), submitted: new Map() }, now);
    openTasks += stat.openCount;
    const last = lastReviews.get(String(s._id)) || null;
    return {
      id: String(s._id),
      name: `${s.firstName} ${s.lastName}`.trim(),
      status: s.status,
      openTasks: stat.openCount,
      overdueTasks: stat.overdueCount,
      completionPct: stat.completionPct,
      lastReviewAt: last,
      reviewDue: !last || now - new Date(last) > REVIEW_INTERVAL_MS,
    };
  });

  const groupNames = new Map((await Group.find({ organizationId: orgId, _id: { $in: upcoming.map((u) => u.groupId) } }).select('name').lean()).map((g) => [String(g._id), g.name]));

  res.json({
    metrics: {
      assignedStudents: students.length,
      groups: groupCount,
      openTasks,
      pendingFeedback,
      reviewsDue: rosterRows.filter((r) => r.reviewDue).length,
    },
    roster: rosterRows,
    upcomingActivities: upcoming.map((a) => ({ id: String(a._id), title: a.title, startsAt: a.startsAt, location: a.location, groupName: groupNames.get(String(a.groupId)) || '' })),
    recentActivity: activity.map((a) => ({ id: String(a._id), summary: a.summary, createdAt: a.createdAt })),
  });
}

// Aggregate progress for the coach's allocated students. Listed alphabetically; not ranked.
async function buildReport(coach, { from, to, groupId }) {
  const { start, end } = parseDateRange(from, to);
  const orgId = coach.organizationId;
  const now = new Date();
  const studentIds = await allocatedStudentIds(coach);
  let scopedIds = studentIds;
  let group = null;
  if (groupId) {
    if (!isId(groupId)) throw new AppError(404, 'Group not found');
    group = await Group.findOne({ _id: groupId, organizationId: orgId, coachId: coach._id }).select('name memberIds').lean();
    if (!group) throw new AppError(404, 'Group not found');
    const members = new Set(group.memberIds.map(String));
    scopedIds = studentIds.filter((id) => members.has(String(id)));
  }

  const students = await User.find({ organizationId: orgId, _id: { $in: scopedIds } }).select('firstName lastName').sort({ lastName: 1, firstName: 1 }).lean();
  const [progress, reviewRows] = await Promise.all([
    buildProgress({ organizationId: orgId, coachId: coach._id, studentIds: scopedIds, now }),
    Review.aggregate([
      { $match: { organizationId: orgId, coachId: coach._id, status: 'submitted', submittedAt: { $gte: start, $lt: end }, studentId: { $in: scopedIds } } },
      { $group: { _id: '$studentId', count: { $sum: 1 } } },
    ]),
  ]);
  const reviewBy = new Map(reviewRows.map((r) => [String(r._id), r.count]));

  // Weekly submission trend for this coach's tasks in range.
  const taskIds = (await Task.find({ organizationId: orgId, coachId: coach._id, status: 'published' }).select('_id').lean()).map((t) => t._id);
  const weekly = await Submission.aggregate([
    { $match: { organizationId: orgId, taskId: { $in: taskIds }, studentId: { $in: scopedIds }, submittedAt: { $gte: start, $lt: end } } },
    { $group: { _id: { $dateToString: { format: '%G-W%V', date: '$submittedAt' } }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  const groupFilter = { organizationId: orgId, coachId: coach._id };
  if (group) groupFilter._id = group._id;
  const groups = await Group.find(groupFilter).select('name memberIds').sort({ name: 1 }).lean();
  const activities = await Activity.aggregate([
    { $match: { organizationId: orgId, coachId: coach._id, startsAt: { $gte: start, $lt: end }, ...(group ? { groupId: group._id } : {}) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const actMap = Object.fromEntries(activities.map((a) => [a._id, a.count]));

  return {
    range: { from: start.toISOString().slice(0, 10), to: new Date(end.getTime() - 86400000).toISOString().slice(0, 10) },
    group: group ? { id: String(group._id), name: group.name } : null,
    students: students.map((s) => {
      const stat = summarize(progress.get(String(s._id)) || { assigned: new Map(), submitted: new Map() }, now);
      return { id: String(s._id), name: `${s.firstName} ${s.lastName}`.trim(), assignedCount: stat.assignedCount, submittedCount: stat.submittedCount, openCount: stat.openCount, overdueCount: stat.overdueCount, completionPct: stat.completionPct, reviewsSubmittedInRange: reviewBy.get(String(s._id)) || 0 };
    }),
    groups: groups.map((g) => ({ id: String(g._id), name: g.name, memberCount: g.memberIds.length })),
    activities: { completed: actMap.completed || 0, scheduled: actMap.scheduled || 0, cancelled: actMap.cancelled || 0 },
    weeklySubmissions: weekly.map((w) => ({ week: w._id, count: w.count })),
    summary: {
      students: students.length,
      reviewsSubmitted: reviewRows.reduce((n, r) => n + r.count, 0),
    },
  };
}

async function getReports(req, res) {
  const report = await buildReport(req.user, req.query);
  res.json({ report });
}

async function exportReport(req, res) {
  const coach = req.user;
  const { type, from, to, groupId } = req.query;
  let csv;
  if (type === 'students') {
    const r = await buildReport(coach, { from, to, groupId });
    csv = toCsv(
      ['Name', 'Assigned tasks', 'Submitted', 'Open', 'Overdue', 'Completion %', 'Reviews submitted in range'],
      r.students.map((s) => [s.name, s.assignedCount, s.submittedCount, s.openCount, s.overdueCount, s.completionPct ?? '', s.reviewsSubmittedInRange])
    );
  } else if (type === 'groups') {
    const r = await buildReport(coach, { from, to, groupId });
    csv = toCsv(['Group', 'Members'], r.groups.map((g) => [g.name, g.memberCount]));
  } else {
    const { start, end } = parseDateRange(from, to);
    const filter = { organizationId: coach.organizationId, coachId: coach._id, startsAt: { $gte: start, $lt: end } };
    if (groupId) {
      await getOwnedGroup(coach, groupId);
      filter.groupId = groupId;
    }
    const items = await Activity.find(filter).sort({ startsAt: 1 }).lean();
    csv = toCsv(['Title', 'Status', 'Starts', 'Ends', 'Location'], items.map((a) => [a.title, a.status, a.startsAt, a.endsAt, a.location]));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="coach-${type}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}

module.exports = { schemas, getDashboard, getReports, exportReport };

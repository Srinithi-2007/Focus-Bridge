'use strict';
// Student-facing data for dashboard, coach, groups, progress, notifications, settings and messages.
// Everything is scoped to the authenticated student. Coach drafts, coach private notes and other students' data are never returned.
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { verifyPassword, hashPassword, passwordSchema } = require('../utils/password');
const { recordAudit } = require('../services/audit');
const { notify } = require('../services/notifications');
const { assignedFilter, myGroupIds } = require('./studentPortalController');
const { isId } = require('../services/coachAccess');
const User = require('../models/User');
const Group = require('../models/Group');
const GroupPost = require('../models/GroupPost');
const GroupResource = require('../models/GroupResource');
const Activity = require('../models/Activity');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const Message = require('../models/Message');
const StudentProfile = require('../models/StudentProfile');
const CalendarEvent = require('../models/CalendarEvent');
const Program = require('../models/Program');

const schemas = {
  message: z.object({ body: z.string().trim().min(1).max(2000) }),
  settings: z
    .object({
      availability: z
        .array(z.object({
          day: z.number().int().min(0).max(6),
          start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        }).refine((w) => w.end > w.start, 'Window end must be after start'))
        .max(21)
        .optional(),
      preferences: z.object({ reminderLeadMinutes: z.number().int().min(15).max(1440).optional(), emailReminders: z.boolean().optional() }).optional(),
      accessibility: z.object({ fontScale: z.enum(['default', 'large', 'xlarge']).optional(), highContrast: z.boolean().optional(), reducedMotion: z.boolean().optional() }).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one setting'),
  password: z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema }),
  notificationsQuery: z.object({ unread: z.enum(['true', 'false']).optional() }),
};

async function getProfile(student) {
  let p = await StudentProfile.findOne({ userId: student._id });
  if (!p) p = await StudentProfile.create({ organizationId: student.organizationId, userId: student._id });
  return p;
}

function displayName(u) {
  return u ? `${u.firstName} ${u.lastName}`.trim() : '';
}

// Dashboard: today's work, next deadlines, the coach, groups and an overall progress figure.
async function getDashboard(req, res) {
  const student = req.user;
  const now = new Date();
  const endOfDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const [tasks, submissions, events, coach, groups, unread] = await Promise.all([
    Task.find(await assignedFilter(student)).sort({ deadline: 1 }).limit(100).lean(),
    Submission.find({ organizationId: student.organizationId, studentId: student._id }).select('taskId').lean(),
    CalendarEvent.find({ userId: student._id, start: { $gte: now, $lt: endOfDay } }).sort({ start: 1 }).limit(20).lean(),
    student.coachId ? User.findById(student.coachId).select('firstName lastName').lean() : null,
    Group.find({ organizationId: student.organizationId, memberIds: student._id }).select('name coachId').lean(),
    Notification.countDocuments({ userId: student._id, readAt: null }),
  ]);
  const doneIds = new Set(submissions.map((s) => String(s.taskId)));
  const open = tasks.filter((t) => !doneIds.has(String(t._id)));
  const dueSoon = open.filter((t) => t.deadline && new Date(t.deadline) - now < 48 * 60 * 60 * 1000);
  res.json({
    today: {
      tasks: open.filter((t) => !t.deadline || new Date(t.deadline) - now < 48 * 60 * 60 * 1000).slice(0, 5).map((t) => ({ id: String(t._id), title: t.title, deadline: t.deadline, priority: t.priority })),
      blocks: events.map((e) => ({ id: String(e._id), title: e.title, start: e.start, end: e.end, done: e.done })),
    },
    deadlines: open.filter((t) => t.deadline).slice(0, 5).map((t) => ({ id: String(t._id), title: t.title, deadline: t.deadline })),
    dueSoonCount: dueSoon.length,
    progress: { assigned: tasks.length, submitted: tasks.length - open.length, completionPct: tasks.length ? Math.round(((tasks.length - open.length) / tasks.length) * 100) : null },
    coach: coach ? { name: displayName(coach) } : null,
    groups: groups.map((g) => ({ id: String(g._id), name: g.name })),
    unreadNotifications: unread,
  });
}

async function getCoach(req, res) {
  const student = req.user;
  const coach = student.coachId ? await User.findOne({ _id: student.coachId, organizationId: student.organizationId, role: 'coach' }).select('firstName lastName email').lean() : null;
  if (!coach) return res.json({ coach: null, feedback: [], goals: null, reviews: [], messages: [] });

  const [feedbackSubs, reviews, messages] = await Promise.all([
    Submission.find({ organizationId: student.organizationId, studentId: student._id, feedback: { $ne: '' } }).sort({ feedbackAt: -1 }).limit(50).lean(),
    Review.find({ organizationId: student.organizationId, studentId: student._id, coachId: coach._id, status: 'submitted' }).sort({ submittedAt: -1 }).limit(50).lean(),
    Message.find({ organizationId: student.organizationId, studentId: student._id, coachId: coach._id }).sort({ createdAt: -1 }).limit(100).lean(),
  ]);
  const taskTitles = new Map((await Task.find({ _id: { $in: feedbackSubs.map((s) => s.taskId) } }).select('title').lean()).map((t) => [String(t._id), t.title]));
  res.json({
    coach: { name: displayName(coach), email: coach.email },
    feedback: feedbackSubs.map((s) => ({ id: String(s._id), taskTitle: taskTitles.get(String(s.taskId)) || 'Task', feedback: s.feedback, feedbackAt: s.feedbackAt })),
    goals: reviews[0] ? { text: reviews[0].nextGoals, fromReviewAt: reviews[0].submittedAt } : null,
    reviews: reviews.map((r) => ({ id: String(r._id), submittedAt: r.submittedAt, strengths: r.strengths, challenges: r.challenges, observations: r.observations, recommendations: r.recommendations, nextGoals: r.nextGoals })),
    messages: messages.reverse().map((m) => ({ id: String(m._id), from: m.from, body: m.body, createdAt: m.createdAt })),
  });
}

// Asynchronous direct line: the message is stored and the coach is notified. No live chat.
async function postMessage(req, res) {
  const student = req.user;
  if (!student.coachId) throw new AppError(409, 'You do not have an assigned coach yet');
  const coach = await User.findOne({ _id: student.coachId, organizationId: student.organizationId, role: 'coach', status: 'active' }).select('_id').lean();
  if (!coach) throw new AppError(409, 'Your coach is not currently available');
  const msg = await Message.create({ organizationId: student.organizationId, studentId: student._id, coachId: coach._id, from: 'student', body: req.body.body });
  await notify({ organizationId: student.organizationId, userId: coach._id, type: 'message', title: `New message from ${displayName(student)}`, body: req.body.body.slice(0, 140), link: '/coach/students' });
  res.status(201).json({ message: { id: String(msg._id), from: msg.from, body: msg.body, createdAt: msg.createdAt } });
}

async function getGroup(req, res) {
  const student = req.user;
  if (!isId(req.params.id)) throw new AppError(404, 'Group not found');
  const group = await Group.findOne({ _id: req.params.id, organizationId: student.organizationId, memberIds: student._id }).lean();
  if (!group) throw new AppError(404, 'Group not found');
  const [coach, posts, resources, activities] = await Promise.all([
    User.findById(group.coachId).select('firstName lastName').lean(),
    GroupPost.find({ organizationId: student.organizationId, groupId: group._id }).sort({ createdAt: -1 }).limit(200).lean(),
    GroupResource.find({ organizationId: student.organizationId, groupId: group._id }).sort({ createdAt: -1 }).lean(),
    Activity.find({ organizationId: student.organizationId, groupId: group._id, status: { $ne: 'cancelled' } }).sort({ startsAt: 1 }).limit(50).lean(),
  ]);
  const authors = new Map((await User.find({ _id: { $in: [...new Set(posts.map((p) => String(p.authorId)))] } }).select('firstName lastName role').lean()).map((u) => [String(u._id), u]));
  const present = (p) => ({ id: String(p._id), kind: p.kind, body: p.deletedAt ? null : p.body, removed: Boolean(p.deletedAt), author: displayName(authors.get(String(p.authorId))) || 'Member', authorRole: authors.get(String(p.authorId))?.role || '', createdAt: p.createdAt });
  const top = posts.filter((p) => !p.parentId);
  const replies = posts.filter((p) => p.parentId);
  res.json({
    group: { id: String(group._id), name: group.name, description: group.description, coachName: coach ? displayName(coach) : '' },
    announcements: top.filter((p) => p.kind === 'announcement').map((p) => ({ ...present(p), replies: replies.filter((r) => String(r.parentId) === String(p._id)).reverse().map(present) })),
    discussions: top.filter((p) => p.kind === 'discussion').map((p) => ({ ...present(p), replies: replies.filter((r) => String(r.parentId) === String(p._id)).reverse().map(present) })),
    resources: resources.map((r) => ({ id: String(r._id), title: r.title, url: r.url })),
    activities: activities.map((a) => ({ id: String(a._id), title: a.title, startsAt: a.startsAt, endsAt: a.endsAt, location: a.location, status: a.status })),
  });
}

// Progress: completion, coach goals and reviews, and planner insights computed from the student's own activity.
// Insights are clearly separate from coach-written reviews.
async function getProgress(req, res) {
  const student = req.user;
  const now = new Date();
  const tasks = await Task.find(await assignedFilter(student)).select('title deadline').lean();
  const subs = await Submission.find({ organizationId: student.organizationId, studentId: student._id }).select('taskId submittedAt late status feedback').lean();
  const subBy = new Map(subs.map((s) => [String(s.taskId), s]));
  const submittedTasks = tasks.filter((t) => subBy.has(String(t._id)));
  const onTime = submittedTasks.filter((t) => !subBy.get(String(t._id)).late).length;
  const events = await CalendarEvent.find({ userId: student._id, start: { $lt: now } }).select('done').lean();
  const blocksDone = events.filter((e) => e.done).length;
  const reviews = await Review.find({ organizationId: student.organizationId, studentId: student._id, status: 'submitted' }).sort({ submittedAt: -1 }).limit(20).lean();
  const coachIds = [...new Set(reviews.map((r) => String(r.coachId)))];
  const coaches = new Map((await User.find({ _id: { $in: coachIds } }).select('firstName lastName').lean()).map((c) => [String(c._id), displayName(c)]));

  const insights = [];
  if (tasks.length === 0) insights.push('No tasks have been assigned yet.');
  else {
    insights.push(`You have submitted ${submittedTasks.length} of ${tasks.length} assigned tasks.`);
    if (submittedTasks.length) insights.push(`${onTime} of your ${submittedTasks.length} submissions were on time.`);
  }
  if (events.length) insights.push(`You completed ${blocksDone} of ${events.length} planned work blocks that have started.`);
  const missed = events.length - blocksDone;
  if (missed > 2) insights.push('Several planned blocks were missed. Consider re-planning a task from the Tasks page.');
  insights.push('These insights are generated from your own activity. Coach reviews are separate.');

  res.json({
    progress: { assigned: tasks.length, submitted: submittedTasks.length, completionPct: tasks.length ? Math.round((submittedTasks.length / tasks.length) * 100) : null, onTime, blocksDone, blocksPlanned: events.length },
    goals: reviews[0] ? { text: reviews[0].nextGoals, fromReviewAt: reviews[0].submittedAt, coachName: coaches.get(String(reviews[0].coachId)) || '' } : null,
    reviews: reviews.map((r) => ({ id: String(r._id), submittedAt: r.submittedAt, coachName: coaches.get(String(r.coachId)) || '', strengths: r.strengths, challenges: r.challenges, observations: r.observations, recommendations: r.recommendations, nextGoals: r.nextGoals })),
    feedback: subs.filter((s) => s.feedback).map((s) => ({ taskId: String(s.taskId), feedback: s.feedback })),
    insights,
    insightsLabel: 'Planner insights (generated from your activity, not from your coach)',
  });
}

async function listNotifications(req, res) {
  const filter = { userId: req.user._id };
  if (req.query.unread === 'true') filter.readAt = null;
  const items = await Notification.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  const unread = await Notification.countDocuments({ userId: req.user._id, readAt: null });
  res.json({ unread, notifications: items.map((n) => ({ id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link, readAt: n.readAt, createdAt: n.createdAt })) });
}

async function markRead(req, res) {
  if (!isId(req.params.id)) throw new AppError(404, 'Notification not found');
  const r = await Notification.updateOne({ _id: req.params.id, userId: req.user._id, readAt: null }, { readAt: new Date() });
  if (!r.matchedCount) {
    const exists = await Notification.exists({ _id: req.params.id, userId: req.user._id });
    if (!exists) throw new AppError(404, 'Notification not found');
  }
  res.json({ message: 'Marked as read' });
}

async function markAllRead(req, res) {
  await Notification.updateMany({ userId: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ message: 'All notifications marked as read' });
}

async function getSettings(req, res) {
  const student = req.user;
  const profile = await getProfile(student);
  const program = student.programId ? await Program.findById(student.programId).select('name').lean() : null;
  res.json({
    profile: { firstName: student.firstName, lastName: student.lastName, email: student.email, programName: program ? program.name : null },
    availability: profile.availability.map((w) => ({ day: w.day, start: w.start, end: w.end })),
    availabilityTimezone: 'UTC',
    preferences: profile.preferences,
    accessibility: profile.accessibility,
  });
}

async function updateSettings(req, res) {
  const profile = await getProfile(req.user);
  const b = req.body;
  if (b.availability) profile.availability = b.availability;
  if (b.preferences) Object.assign(profile.preferences, b.preferences);
  if (b.accessibility) Object.assign(profile.accessibility, b.accessibility);
  await profile.save();
  await recordAudit({ organizationId: req.user.organizationId, actorId: req.user._id, action: 'student.settings', targetType: 'user', targetId: req.user._id, summary: 'Updated student settings' });
  res.json({ message: 'Settings saved' });
}

async function changePassword(req, res) {
  const user = await User.findById(req.user._id).select('+passwordHash');
  const ok = user && user.passwordHash && (await verifyPassword(req.body.currentPassword, user.passwordHash));
  if (!ok) throw new AppError(400, 'Your current password is incorrect');
  if (await verifyPassword(req.body.newPassword, user.passwordHash)) throw new AppError(400, 'Choose a password you have not used just now');
  user.passwordHash = await hashPassword(req.body.newPassword);
  await user.save();
  await recordAudit({ organizationId: user.organizationId, actorId: user._id, action: 'student.password', targetType: 'user', targetId: user._id, summary: 'Changed password' });
  res.json({ message: 'Password updated' });
}

module.exports = { schemas, getProfile, getDashboard, getCoach, postMessage, getGroup, getProgress, listNotifications, markRead, markAllRead, getSettings, updateSettings, changePassword };

'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { escapeRegex, clampPagination } = require('../services/rules');
const { getAllocatedStudent, allocatedStudentIds, isId } = require('../services/coachAccess');
const { buildProgress, summarize } = require('../services/progress');
const { presentTask } = require('./coachTaskController');
const User = require('../models/User');
const Group = require('../models/Group');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const Review = require('../models/Review');
const CoachNote = require('../models/CoachNote');
const Program = require('../models/Program');

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const schemas = {
  listStudents: z.object({
    search: z.string().trim().max(100).optional(),
    groupId: objectId.optional(),
    needsReview: z.enum(['true', 'false']).optional(),
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
  note: z.object({ body: z.string().trim().min(1).max(3000) }),
};

function displayName(u) {
  return `${u.firstName} ${u.lastName}`.trim();
}

// Latest submitted review date per student, for the "review due" indicator.
async function lastReviewMap(orgId, coachId, studentIds) {
  const rows = await Review.aggregate([
    { $match: { organizationId: orgId, coachId, studentId: { $in: studentIds }, status: 'submitted' } },
    { $group: { _id: '$studentId', last: { $max: '$submittedAt' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.last]));
}

const REVIEW_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

async function listStudents(req, res) {
  const coach = req.user;
  const { search, groupId, needsReview } = req.query;
  const { page, limit, skip } = clampPagination(req.query);

  const ids = await allocatedStudentIds(coach);
  const filter = { organizationId: coach.organizationId, role: 'student', coachId: coach._id };
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
  }
  if (groupId) {
    const group = await Group.findOne({ _id: groupId, organizationId: coach.organizationId, coachId: coach._id }).select('memberIds').lean();
    if (!group) throw new AppError(404, 'Group not found');
    filter._id = { $in: group.memberIds.filter((m) => ids.some((i) => String(i) === String(m))) };
  }

  const all = await User.find(filter).sort({ lastName: 1, firstName: 1 }).select('firstName lastName email status programId').lean();
  const studentIds = all.map((s) => s._id);
  const [progress, reviews, groups, programs] = await Promise.all([
    buildProgress({ organizationId: coach.organizationId, coachId: coach._id, studentIds }),
    lastReviewMap(coach.organizationId, coach._id, studentIds),
    Group.find({ organizationId: coach.organizationId, coachId: coach._id, memberIds: { $in: studentIds } }).select('name memberIds').lean(),
    Program.find({ organizationId: coach.organizationId }).select('name').lean(),
  ]);
  const programName = new Map(programs.map((p) => [String(p._id), p.name]));
  const now = new Date();

  let rows = all.map((s) => {
    const id = String(s._id);
    const stat = summarize(progress.get(id) || { assigned: new Map(), submitted: new Map() }, now);
    const last = reviews.get(id) || null;
    const reviewDue = !last || now - new Date(last) > REVIEW_INTERVAL_MS;
    return {
      id,
      name: displayName(s),
      email: s.email,
      status: s.status,
      programName: s.programId ? programName.get(String(s.programId)) || null : null,
      groups: groups.filter((g) => g.memberIds.some((m) => String(m) === id)).map((g) => ({ id: String(g._id), name: g.name })),
      openTasks: stat.openCount,
      overdueTasks: stat.overdueCount,
      completionPct: stat.completionPct,
      lastReviewAt: last,
      reviewDue,
    };
  });
  if (needsReview === 'true') rows = rows.filter((r) => r.reviewDue);
  if (needsReview === 'false') rows = rows.filter((r) => !r.reviewDue);

  const total = rows.length;
  res.json({ total, page, limit, students: rows.slice(skip, skip + limit) });
}

async function getStudent(req, res) {
  const coach = req.user;
  const student = await getAllocatedStudent(coach, req.params.id);
  const orgId = coach.organizationId;
  const now = new Date();
  const [program, groups, progress, reviews, notes, submissions] = await Promise.all([
    student.programId ? Program.findById(student.programId).select('name').lean() : null,
    Group.find({ organizationId: orgId, coachId: coach._id, memberIds: student._id }).select('name').lean(),
    buildProgress({ organizationId: orgId, coachId: coach._id, studentIds: [student._id], now }),
    Review.find({ organizationId: orgId, coachId: coach._id, studentId: student._id, status: 'submitted' }).sort({ submittedAt: -1 }).limit(50).lean(),
    CoachNote.find({ organizationId: orgId, coachId: coach._id, studentId: student._id }).sort({ createdAt: -1 }).limit(100).lean(),
    Submission.find({ organizationId: orgId, studentId: student._id }).sort({ submittedAt: -1 }).limit(100).lean(),
  ]);

  const entry = progress.get(String(student._id)) || { assigned: new Map(), submitted: new Map() };
  const stat = summarize(entry, now);

  // Assigned tasks with this student's state for each.
  const taskRows = [...entry.assigned.entries()].map(([taskId, task]) => {
    const sub = entry.submitted.get(taskId);
    let state = 'not_started';
    if (sub) state = sub.status === 'reviewed' ? 'reviewed' : 'submitted';
    else if (task.deadline && new Date(task.deadline) < now) state = 'overdue';
    return { id: taskId, title: task.title, deadline: task.deadline, audience: task.audience, state, submittedAt: sub ? sub.submittedAt : null, late: sub ? sub.late : false };
  });
  taskRows.sort((a, b) => (a.deadline ? new Date(a.deadline) : Infinity) - (b.deadline ? new Date(b.deadline) : Infinity));

  // Progress history: this coach's task submissions, newest first.
  const taskTitles = new Map((await Task.find({ _id: { $in: submissions.map((s) => s.taskId) } }).select('title').lean()).map((t) => [String(t._id), t.title]));
  const history = submissions
    .filter((s) => entry.assigned.has(String(s.taskId)))
    .map((s) => ({
      id: String(s._id),
      taskId: String(s.taskId),
      taskTitle: taskTitles.get(String(s.taskId)) || 'Task',
      submittedAt: s.submittedAt,
      status: s.status,
      late: s.late,
      attempts: s.attempts,
      feedback: s.feedback,
    }));

  const latestReview = reviews[0] || null;

  res.json({
    student: {
      id: String(student._id),
      name: displayName(student),
      email: student.email,
      status: student.status,
      programName: program ? program.name : null,
      groups: groups.map((g) => ({ id: String(g._id), name: g.name })),
    },
    overview: { assignedCount: stat.assignedCount, submittedCount: stat.submittedCount, openCount: stat.openCount, overdueCount: stat.overdueCount, completionPct: stat.completionPct, reviewCount: reviews.length },
    // Goals come from the most recent submitted review's "next goals" section.
    goals: latestReview ? { text: latestReview.nextGoals, fromReviewAt: latestReview.submittedAt } : null,
    tasks: taskRows,
    history,
    reviews: reviews.map((r) => ({ id: String(r._id), submittedAt: r.submittedAt, strengths: r.strengths, challenges: r.challenges, observations: r.observations, recommendations: r.recommendations, nextGoals: r.nextGoals })),
    // Private: visible only to the authenticated coach. Not part of any student-facing response.
    privateNotes: notes.map((n) => ({ id: String(n._id), body: n.body, createdAt: n.createdAt })),
  });
}

async function addNote(req, res) {
  const coach = req.user;
  const student = await getAllocatedStudent(coach, req.params.id);
  const note = await CoachNote.create({ organizationId: coach.organizationId, coachId: coach._id, studentId: student._id, body: req.body.body });
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'student.note', targetType: 'user', targetId: student._id, summary: 'Added a private coach note' });
  res.status(201).json({ note: { id: String(note._id), body: note.body, createdAt: note.createdAt } });
}

async function deleteNote(req, res) {
  const coach = req.user;
  await getAllocatedStudent(coach, req.params.id);
  if (!isId(req.params.noteId)) throw new AppError(404, 'Note not found');
  const result = await CoachNote.deleteOne({ _id: req.params.noteId, organizationId: coach.organizationId, coachId: coach._id, studentId: req.params.id });
  if (!result.deletedCount) throw new AppError(404, 'Note not found');
  res.json({ message: 'Note deleted' });
}

module.exports = { schemas, listStudents, getStudent, addNote, deleteNote, buildProgress, lastReviewMap, REVIEW_INTERVAL_MS };

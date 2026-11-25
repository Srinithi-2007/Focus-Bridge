'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { assertReviewSubmittable } = require('../services/coachRules');
const { getAllocatedStudent, getOwnedReview, isId } = require('../services/coachAccess');
const { notify } = require('../services/notifications');
const Review = require('../models/Review');
const User = require('../models/User');

const text = z.string().max(3000);
const sections = { strengths: text, challenges: text, observations: text, recommendations: text, nextGoals: text };

const schemas = {
  createReview: z.object({
    studentId: z.string().regex(/^[a-f0-9]{24}$/),
    ...sections,
    strengths: text.default(''),
    challenges: text.default(''),
    observations: text.default(''),
    recommendations: text.default(''),
    nextGoals: text.default(''),
    submit: z.boolean().default(false),
  }),
  updateReview: z
    .object({ ...sections, submit: z.boolean().optional() })
    .partial()
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update'),
  listReviews: z.object({
    studentId: z.string().regex(/^[a-f0-9]{24}$/).optional(),
    status: z.enum(['draft', 'submitted']).optional(),
  }),
};

function present(r, studentName) {
  return {
    id: String(r._id),
    studentId: String(r.studentId),
    studentName,
    status: r.status,
    strengths: r.strengths,
    challenges: r.challenges,
    observations: r.observations,
    recommendations: r.recommendations,
    nextGoals: r.nextGoals,
    submittedAt: r.submittedAt,
    updatedAt: r.updatedAt,
    createdAt: r.createdAt,
  };
}

async function nameMap(orgId, ids) {
  const users = await User.find({ organizationId: orgId, _id: { $in: ids } }).select('firstName lastName').lean();
  return new Map(users.map((u) => [String(u._id), `${u.firstName} ${u.lastName}`.trim()]));
}

// Reviews for allocated students only. Coach-authored content; never merged with AI-generated insights.
async function listReviews(req, res) {
  const coach = req.user;
  const filter = { organizationId: coach.organizationId, coachId: coach._id };
  if (req.query.studentId) {
    await getAllocatedStudent(coach, req.query.studentId);
    filter.studentId = req.query.studentId;
  }
  if (req.query.status) filter.status = req.query.status;
  const reviews = await Review.find(filter).sort({ updatedAt: -1 }).limit(300).lean();
  const names = await nameMap(coach.organizationId, [...new Set(reviews.map((r) => String(r.studentId)))]);
  res.json({ reviews: reviews.map((r) => present(r, names.get(String(r.studentId)) || '')) });
}

async function getReview(req, res) {
  const coach = req.user;
  const review = await getOwnedReview(coach, req.params.id);
  await getAllocatedStudent(coach, review.studentId);
  const names = await nameMap(coach.organizationId, [review.studentId]);
  res.json({ review: present(review, names.get(String(review.studentId)) || '') });
}

async function createReview(req, res) {
  const coach = req.user;
  const { studentId, submit, ...content } = req.body;
  const student = await getAllocatedStudent(coach, studentId);
  const review = new Review({ organizationId: coach.organizationId, coachId: coach._id, studentId: student._id, status: 'draft', ...content });
  if (submit) {
    assertReviewSubmittable(review);
    review.status = 'submitted';
    review.submittedAt = new Date();
  }
  await review.save();
  if (submit) {
    await notify({
      organizationId: coach.organizationId,
      userId: review.studentId,
      type: 'feedback',
      title: 'New review submitted by your coach',
      body: review.nextGoals ? `Next goals: ${review.nextGoals.slice(0, 100)}` : 'Your coach submitted a new progress review',
      link: '/student/coach',
    });
  }
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: submit ? 'review.submit' : 'review.draft', targetType: 'review', targetId: review._id, summary: `${submit ? 'Submitted' : 'Saved draft of'} a review` });
  res.status(201).json({ review: present(review, `${student.firstName} ${student.lastName}`.trim()) });
}

// Drafts are editable. Submitted reviews are locked, so the record of what was submitted never changes.
async function updateReview(req, res) {
  const coach = req.user;
  const review = await getOwnedReview(coach, req.params.id);
  await getAllocatedStudent(coach, review.studentId);
  if (review.status === 'submitted') throw new AppError(409, 'Submitted reviews are locked and cannot be edited');

  const { submit, ...content } = req.body;
  for (const [k, v] of Object.entries(content)) review[k] = v;
  if (submit) {
    assertReviewSubmittable(review);
    review.status = 'submitted';
    review.submittedAt = new Date();
  }
  await review.save();
  if (submit) {
    await notify({
      organizationId: coach.organizationId,
      userId: review.studentId,
      type: 'feedback',
      title: 'New review submitted by your coach',
      body: review.nextGoals ? `Next goals: ${review.nextGoals.slice(0, 100)}` : 'Your coach submitted a new progress review',
      link: '/student/coach',
    });
  }
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: submit ? 'review.submit' : 'review.update', targetType: 'review', targetId: review._id, summary: submit ? 'Submitted a review' : 'Updated review draft' });
  const names = await nameMap(coach.organizationId, [review.studentId]);
  res.json({ review: present(review, names.get(String(review.studentId)) || '') });
}

module.exports = { schemas, listReviews, getReview, createReview, updateReview };

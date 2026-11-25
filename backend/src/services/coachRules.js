'use strict';
// Pure business rules for Phase 3. No database access, so they are unit tested directly.
const AppError = require('../utils/AppError');

const MAX_ACTIVITY_MS = 8 * 60 * 60 * 1000;

function isSafeUrl(value) {
  try {
    const u = new URL(String(value));
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Target must be exactly one of: a student (individual task) or a group. Ids are validated elsewhere.
function assertTaskTarget({ audience, studentId, groupId }) {
  if (audience === 'student') {
    if (!studentId) throw new AppError(400, 'Choose a student for an individual task');
    if (groupId) throw new AppError(400, 'An individual task cannot also target a group');
  } else if (audience === 'group') {
    if (!groupId) throw new AppError(400, 'Choose a group for a group task');
    if (studentId) throw new AppError(400, 'A group task cannot also target a student');
  } else {
    throw new AppError(400, 'Audience must be student or group');
  }
}

// A task can be published only with clear instructions and a deadline that has not already passed.
function assertPublishable(task, now = new Date()) {
  if (!task.title || task.title.trim().length < 3) throw new AppError(400, 'Give the task a title of at least 3 characters');
  if (!task.instructions || task.instructions.trim().length < 10) {
    throw new AppError(400, 'Add instructions of at least 10 characters before publishing');
  }
  if (task.deadline && new Date(task.deadline) <= now) throw new AppError(400, 'The deadline must be in the future');
}

// Archived tasks are read-only. Published tasks keep their audience; instructions and deadlines are revisable.
function assertTaskEditable(task, changes) {
  if (task.status === 'archived') throw new AppError(409, 'Archived tasks cannot be edited');
  if (task.status === 'published' && changes.audience !== undefined && changes.audience !== task.audience) {
    throw new AppError(409, 'The audience of a published task cannot be changed');
  }
}

function isRevision(task, changes) {
  if (task.status !== 'published') return false;
  const instructionsChanged = changes.instructions !== undefined && changes.instructions !== task.instructions;
  const deadlineChanged = changes.deadline !== undefined && String(changes.deadline ? new Date(changes.deadline).getTime() : null) !== String(task.deadline ? new Date(task.deadline).getTime() : null);
  return instructionsChanged || deadlineChanged;
}

function isLate(task, submittedAt) {
  return Boolean(task.deadline) && new Date(submittedAt) > new Date(task.deadline);
}

// Reviews can be submitted only when the core sections are written.
function assertReviewSubmittable(review) {
  const missing = [];
  if (!review.strengths || !review.strengths.trim()) missing.push('strengths');
  if (!review.observations || !review.observations.trim()) missing.push('observations');
  if (!review.nextGoals || !review.nextGoals.trim()) missing.push('next goals');
  if (missing.length) throw new AppError(400, `Add ${missing.join(', ')} before submitting the review`);
}

function assertActivityTimes({ startsAt, endsAt }, now = new Date(), { requireFuture = false } = {}) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (requireFuture && start <= now) throw new AppError(400, 'Activities must start in the future');
  if (end <= start) throw new AppError(400, 'The end time must be after the start time');
  if (end - start > MAX_ACTIVITY_MS) throw new AppError(400, 'Activities can last at most 8 hours');
}

function assertCanCompleteActivity(activity, now = new Date()) {
  if (activity.status !== 'scheduled') throw new AppError(409, 'Only scheduled activities can be completed');
  if (new Date(activity.startsAt) > now) throw new AppError(409, 'An activity can be marked completed after it starts');
}

function assertCanCancelActivity(activity) {
  if (activity.status !== 'scheduled') throw new AppError(409, 'Only scheduled activities can be cancelled');
}

// Replies go one level deep and must target a live post in the same group.
function assertValidReplyTarget(parent, groupId) {
  if (!parent || String(parent.groupId) !== String(groupId)) throw new AppError(400, 'The post you are replying to is not in this group');
  if (parent.deletedAt) throw new AppError(409, 'This post has been removed');
  if (parent.parentId) throw new AppError(400, 'Replies can only be added to top-level posts');
}

module.exports = {
  MAX_ACTIVITY_MS,
  isSafeUrl,
  assertTaskTarget,
  assertPublishable,
  assertTaskEditable,
  isRevision,
  isLate,
  assertReviewSubmittable,
  assertActivityTimes,
  assertCanCompleteActivity,
  assertCanCancelActivity,
  assertValidReplyTarget,
};

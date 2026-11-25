'use strict';
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const { getAllocatedStudent, getOwnedTask } = require('../services/coachAccess');
const { notify } = require('../services/notifications');
const Submission = require('../models/Submission');

// Coach feedback on a submission. The coach must own the task AND the submitting student must still be allocated to them.
async function recordSubmissionFeedback(coach, submissionId, feedback) {
  const submission = await Submission.findOne({ _id: submissionId, organizationId: coach.organizationId });
  if (!submission) throw new AppError(404, 'Submission not found');
  const task = await getOwnedTask(coach, submission.taskId);
  await getAllocatedStudent(coach, submission.studentId);

  submission.feedback = feedback;
  submission.feedbackAt = new Date();
  submission.feedbackById = coach._id;
  submission.status = 'reviewed';
  await submission.save();
  await notify({ organizationId: coach.organizationId, userId: submission.studentId, type: 'feedback', title: 'New feedback from your coach', body: `Feedback on "${task.title}"`, link: '/student/tasks' });
  await recordAudit({ organizationId: coach.organizationId, actorId: coach._id, action: 'task.feedback', targetType: 'submission', targetId: submission._id, summary: `Gave feedback on "${task.title}"` });
  return { submission: { id: String(submission._id), status: submission.status, feedback: submission.feedback, feedbackAt: submission.feedbackAt } };
}

module.exports = { recordSubmissionFeedback };

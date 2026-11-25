'use strict';
// Central authorization for coach data. Every lookup is scoped by organizationId AND by the coach's own id
// (taken from the database-verified session user, never from the request body).
// Unauthorized lookups return 404 rather than 403 so other coaches' records cannot be probed.
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const User = require('../models/User');
const Group = require('../models/Group');
const Task = require('../models/Task');
const Review = require('../models/Review');

const isId = (id) => mongoose.isValidObjectId(id) && String(new mongoose.Types.ObjectId(id)) === String(id);

async function getAllocatedStudent(coach, studentId) {
  if (!isId(studentId)) throw new AppError(404, 'Student not found');
  const student = await User.findOne({ _id: studentId, organizationId: coach.organizationId, role: 'student', coachId: coach._id });
  if (!student) throw new AppError(404, 'Student not found');
  return student;
}

async function getOwnedGroup(coach, groupId) {
  if (!isId(groupId)) throw new AppError(404, 'Group not found');
  const group = await Group.findOne({ _id: groupId, organizationId: coach.organizationId, coachId: coach._id });
  if (!group) throw new AppError(404, 'Group not found');
  return group;
}

async function getOwnedTask(coach, taskId) {
  if (!isId(taskId)) throw new AppError(404, 'Task not found');
  const task = await Task.findOne({ _id: taskId, organizationId: coach.organizationId, coachId: coach._id });
  if (!task) throw new AppError(404, 'Task not found');
  return task;
}

async function getOwnedReview(coach, reviewId) {
  if (!isId(reviewId)) throw new AppError(404, 'Review not found');
  const review = await Review.findOne({ _id: reviewId, organizationId: coach.organizationId, coachId: coach._id });
  if (!review) throw new AppError(404, 'Review not found');
  return review;
}

// Ids of all students allocated to this coach in this organization.
async function allocatedStudentIds(coach) {
  return User.distinct('_id', { organizationId: coach.organizationId, role: 'student', coachId: coach._id });
}

module.exports = { isId, getAllocatedStudent, getOwnedGroup, getOwnedTask, getOwnedReview, allocatedStudentIds };

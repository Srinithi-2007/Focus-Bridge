'use strict';
const mongoose = require('mongoose');

// A proposed breakdown of one assigned task into subtasks and a schedule. Nothing reaches the calendar until approved.
const subtaskSchema = new mongoose.Schema(
  { title: { type: String, required: true, maxlength: 160 }, estimateMinutes: { type: Number, min: 5, max: 480 }, done: { type: Boolean, default: false }, doneAt: { type: Date, default: null } },
  { _id: true }
);
const blockSchema = new mongoose.Schema(
  { subtaskId: { type: mongoose.Schema.Types.ObjectId, required: true }, start: { type: Date, required: true }, end: { type: Date, required: true } },
  { _id: true }
);

const planSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    status: { type: String, enum: ['proposed', 'approved', 'rejected', 'superseded'], default: 'proposed' },
    source: { type: String, enum: ['ai', 'planner'], required: true },
    sourceNote: { type: String, maxlength: 200 },
    subtasks: { type: [subtaskSchema], default: [] },
    blocks: { type: [blockSchema], default: [] },
    unscheduledMinutes: { type: Number, default: 0 },
    feasible: { type: Boolean, default: true },
    warnings: { type: [String], default: [] },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

planSchema.index({ studentId: 1, taskId: 1, status: 1 });

module.exports = mongoose.model('Plan', planSchema);

'use strict';
const mongoose = require('mongoose');

// Work blocks created when a student approves a plan. Deadlines and group activities are read from their sources, not copied here.
const calendarEventSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    subtaskId: { type: mongoose.Schema.Types.ObjectId, default: null },
    title: { type: String, required: true, maxlength: 200 },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    done: { type: Boolean, default: false },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

calendarEventSchema.index({ userId: 1, start: 1 });

module.exports = mongoose.model('CalendarEvent', calendarEventSchema);

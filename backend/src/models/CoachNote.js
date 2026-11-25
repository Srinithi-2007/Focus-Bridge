'use strict';
const mongoose = require('mongoose');

// Private notes a coach keeps about a student. Never returned by any student-facing API.
const coachNoteSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 3000 },
  },
  { timestamps: true }
);

coachNoteSchema.index({ organizationId: 1, coachId: 1, studentId: 1, createdAt: -1 });

module.exports = mongoose.model('CoachNote', coachNoteSchema);

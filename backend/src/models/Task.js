'use strict';
const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema(
  { name: { type: String, trim: true, maxlength: 120 }, url: { type: String, trim: true, maxlength: 2048 } },
  { _id: false }
);

// A task assigned by a coach to one student or to one group. Coach-authored instructions and the first published deadline are preserved.
const taskSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    instructions: { type: String, default: '', maxlength: 5000 },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    deadline: { type: Date, default: null },
    audience: { type: String, enum: ['student', 'group'], required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    attachments: { type: [attachmentSchema], default: [], validate: [(v) => v.length <= 10, 'At most 10 attachments'] },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    publishedAt: { type: Date, default: null },
    originalInstructions: { type: String, default: null },
    originalDeadline: { type: Date, default: null },
    revisionCount: { type: Number, default: 0 },
    lastEditedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ organizationId: 1, coachId: 1, status: 1 });
taskSchema.index({ organizationId: 1, studentId: 1, status: 1 });
taskSchema.index({ organizationId: 1, groupId: 1, status: 1 });

module.exports = mongoose.model('Task', taskSchema);

'use strict';
const mongoose = require('mongoose');

// Asynchronous direct line between one student and their assigned coach. Messages are not live chat.
const messageSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    from: { type: String, enum: ['student', 'coach'], required: true },
    body: { type: String, required: true, maxlength: 2000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ studentId: 1, coachId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);

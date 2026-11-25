'use strict';
const mongoose = require('mongoose');

// Scheduled group activities or sessions. These are group-based; there is no one-to-one live teaching model.
const activitySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: '', maxlength: 2000 },
    location: { type: String, default: '', maxlength: 200 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true }
);

activitySchema.index({ organizationId: 1, coachId: 1, startsAt: 1 });
activitySchema.index({ organizationId: 1, groupId: 1, startsAt: 1 });

module.exports = mongoose.model('Activity', activitySchema);

'use strict';
const mongoose = require('mongoose');

// dedupeKey makes reminders idempotent: a unique key per reminder means the same reminder is never stored twice.
const notificationSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['task', 'feedback', 'reminder', 'deadline', 'group', 'message', 'plan'], required: true },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, default: '', maxlength: 500 },
    link: { type: String, default: '', maxlength: 200 },
    readAt: { type: Date, default: null },
    dedupeKey: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });
notificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);

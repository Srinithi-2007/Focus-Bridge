'use strict';
const mongoose = require('mongoose');

// Records administrative actions for the dashboard "recent activity" feed and for accountability.
const auditLogSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, maxlength: 60 },
    targetType: { type: String, maxlength: 30, default: '' },
    targetId: { type: String, maxlength: 40, default: '' },
    summary: { type: String, maxlength: 300, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

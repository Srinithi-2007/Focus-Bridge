'use strict';
const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '' },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    settings: {
      timezone: { type: String, default: 'UTC', maxlength: 64 },
      programLabel: { type: String, default: 'Program', maxlength: 40 },
      invitations: {
        expiryDays: { type: Number, default: 7, min: 1, max: 30 },
      },
      notifications: {
        inviteEmails: { type: Boolean, default: true },
        approvalEmails: { type: Boolean, default: true },
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Organization', organizationSchema);

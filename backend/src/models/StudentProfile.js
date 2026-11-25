'use strict';
const mongoose = require('mongoose');

// Student-owned settings: weekly availability (UTC), reminder preferences and accessibility options.
const windowSchema = new mongoose.Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true },
    start: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, required: true },
    end: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, required: true },
  },
  { _id: false }
);

const studentProfileSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    availability: { type: [windowSchema], default: [], validate: [(v) => v.length <= 21, 'At most 21 availability windows'] },
    preferences: {
      reminderLeadMinutes: { type: Number, default: 60, min: 15, max: 1440 },
      emailReminders: { type: Boolean, default: false },
    },
    accessibility: {
      fontScale: { type: String, enum: ['default', 'large', 'xlarge'], default: 'default' },
      highContrast: { type: Boolean, default: false },
      reducedMotion: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StudentProfile', studentProfileSchema);

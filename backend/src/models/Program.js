'use strict';
const mongoose = require('mongoose');

// Coaching programs / tracks. Descriptions and coaching areas are plain text; no diagnosis categories.
const programSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    coachingAreas: { type: [{ type: String, trim: true, maxlength: 60 }], default: [], validate: [(v) => v.length <= 12, 'Too many coaching areas'] },
  },
  { timestamps: true }
);

programSchema.index({ organizationId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Program', programSchema);

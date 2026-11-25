'use strict';
const mongoose = require('mongoose');

const MAX_MEMBERS = 200;

// A classroom/cohort. Membership is stored on the group; a student may belong to several groups.
const groupSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', default: null },
    memberIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
      validate: [(v) => v.length <= MAX_MEMBERS, `A group can have at most ${MAX_MEMBERS} members`],
    },
  },
  { timestamps: true }
);

groupSchema.index({ organizationId: 1, name: 1 }, { unique: true });
groupSchema.index({ organizationId: 1, memberIds: 1 });

module.exports = mongoose.model('Group', groupSchema);
module.exports.MAX_MEMBERS = MAX_MEMBERS;

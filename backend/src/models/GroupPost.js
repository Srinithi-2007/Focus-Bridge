'use strict';
const mongoose = require('mongoose');

// Classroom posts: announcements and discussion messages, with one level of replies (parentId).
// Deleted posts are soft-deleted so reply threads stay readable as "removed".
const groupPostSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['announcement', 'discussion'], required: true },
    body: { type: String, required: true, maxlength: 2000 },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'GroupPost', default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

groupPostSchema.index({ organizationId: 1, groupId: 1, createdAt: -1 });

module.exports = mongoose.model('GroupPost', groupPostSchema);

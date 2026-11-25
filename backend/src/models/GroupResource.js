'use strict';
const mongoose = require('mongoose');

// Shared resources are stored as links (http/https). File storage is not part of this release.
const groupResourceSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    uploaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 150 },
    url: { type: String, required: true, trim: true, maxlength: 2048 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GroupResource', groupResourceSchema);

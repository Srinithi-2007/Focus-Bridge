'use strict';
const mongoose = require('mongoose');

const ROLES = ['admin', 'coach', 'student'];
const STATUSES = ['invited', 'pending_approval', 'active', 'deactivated'];

const userSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, select: false },
    firstName: { type: String, trim: true, maxlength: 80, default: '' },
    lastName: { type: String, trim: true, maxlength: 80, default: '' },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: STATUSES, default: 'invited' },
    // Students only: the coach assigned by an admin (allocation).
    coachId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Students only: the coaching program they are enrolled in.
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program', default: null },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ organizationId: 1, role: 1, status: 1 });

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    organizationId: this.organizationId.toString(),
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    role: this.role,
    status: this.status,
    coachId: this.coachId ? this.coachId.toString() : null,
    programId: this.programId ? this.programId.toString() : null,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.STATUSES = STATUSES;

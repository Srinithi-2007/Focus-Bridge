'use strict';
// Invitations, approvals, status changes and account edits shared by student and coach management.
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { createOpaqueToken } = require('../utils/tokens');
const { sendMail } = require('../services/mailer');
const { recordAudit } = require('../services/audit');
const env = require('../config/env');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Organization = require('../models/Organization');
const { escapeRegex } = require('../services/rules');

const schemas = {
  createInvitation: z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    role: z.enum(['coach', 'student']),
  }),
  listInvitations: z.object({
    role: z.enum(['coach', 'student']).optional(),
    state: z.enum(['open', 'accepted', 'revoked', 'expired']).optional(),
  }),
  listUsers: z.object({
    role: z.enum(['coach', 'student']).optional(),
    status: z.enum(['invited', 'pending_approval', 'active', 'deactivated']).optional(),
  }),
  setStatus: z.object({ status: z.enum(['active', 'deactivated']) }),
  updateUser: z
    .object({
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().min(1).max(80).optional(),
      email: z.string().trim().toLowerCase().email().max(254).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update'),
};

async function findOrgUser(req, id) {
  const user = await User.findOne({ _id: id, organizationId: req.organizationId, role: { $in: ['coach', 'student'] } });
  if (!user) throw new AppError(404, 'User not found');
  return user;
}

async function createInvitation(req, res) {
  const { email, role } = req.body;
  const orgId = req.organizationId;

  if (await User.exists({ email })) {
    throw new AppError(409, 'An account with this email already exists');
  }
  // Prevent duplicates: an open invitation must be revoked before a new one is sent.
  const open = await Invitation.findOne({ organizationId: orgId, email, acceptedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } });
  if (open) throw new AppError(409, 'An open invitation already exists for this email. Revoke it first to send a new one.');

  const org = await Organization.findById(orgId);
  const expiryDays = org?.settings?.invitations?.expiryDays || 7;
  const { raw, hash } = createOpaqueToken();
  const invitation = await Invitation.create({
    organizationId: orgId,
    email,
    role,
    tokenHash: hash,
    invitedBy: req.user._id,
    expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
  });

  if (org?.settings?.notifications?.inviteEmails !== false) {
    const link = `${env.clientUrl}/register?invite=${raw}`;
    await sendMail({
      to: email,
      subject: `You're invited to ${org ? org.name : 'FocusBridge'} on FocusBridge`,
      text: `Activate your ${role} account (valid ${expiryDays} days): ${link}`,
    });
  }

  await recordAudit({ organizationId: orgId, actorId: req.user._id, action: 'invitation.create', targetType: 'invitation', targetId: invitation._id, summary: `Invited ${email} as ${role}` });
  res.status(201).json({ id: invitation._id.toString(), email, role, expiresAt: invitation.expiresAt });
}

function invitationState(i, now) {
  if (i.revokedAt) return 'revoked';
  if (i.acceptedAt) return 'accepted';
  if (i.expiresAt <= now) return 'expired';
  return 'open';
}

async function listInvitations(req, res) {
  const filter = { organizationId: req.organizationId };
  if (req.query.role) filter.role = req.query.role;
  const now = new Date();
  const docs = await Invitation.find(filter).sort({ createdAt: -1 }).limit(300).lean();
  let invitations = docs.map((i) => ({
    id: i._id.toString(),
    email: i.email,
    role: i.role,
    state: invitationState(i, now),
    expiresAt: i.expiresAt,
    acceptedAt: i.acceptedAt,
    revokedAt: i.revokedAt,
    createdAt: i.createdAt,
  }));
  if (req.query.state) invitations = invitations.filter((i) => i.state === req.query.state);
  res.json({ invitations });
}

async function revokeInvitation(req, res) {
  const invitation = await Invitation.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.organizationId, acceptedAt: null, revokedAt: null },
    { revokedAt: new Date() },
    { returnDocument: 'after' }
  );
  if (!invitation) throw new AppError(404, 'Invitation not found or already closed');
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'invitation.revoke', targetType: 'invitation', targetId: invitation._id, summary: `Revoked invitation for ${invitation.email}` });
  res.json({ message: 'Invitation revoked' });
}

async function listUsers(req, res) {
  const filter = { organizationId: req.organizationId, role: { $in: ['coach', 'student'] } };
  if (req.query.role) filter.role = req.query.role;
  if (req.query.status) filter.status = req.query.status;
  const users = await User.find(filter).sort({ lastName: 1, firstName: 1 }).limit(500);
  res.json({ users: users.map((u) => u.toSafeJSON()) });
}

async function approveCoach(req, res) {
  const user = await User.findOneAndUpdate(
    { _id: req.params.id, organizationId: req.organizationId, role: 'coach', status: 'pending_approval' },
    { status: 'active' },
    { returnDocument: 'after' }
  );
  if (!user) throw new AppError(404, 'No pending coach found with that id');
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'coach.approve', targetType: 'user', targetId: user._id, summary: `Approved coach ${user.email}` });
  res.json({ user: user.toSafeJSON() });
}

async function setUserStatus(req, res) {
  const target = await findOrgUser(req, req.params.id);
  if (target._id.equals(req.user._id)) throw new AppError(400, 'You cannot change your own status');
  if (target.status === 'invited' || target.status === 'pending_approval') {
    throw new AppError(400, 'Approve or activate this account first');
  }
  if (target.status === req.body.status) return res.json({ user: target.toSafeJSON() });

  target.status = req.body.status;
  await target.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: req.body.status === 'active' ? 'user.reactivate' : 'user.deactivate', targetType: 'user', targetId: target._id, summary: `${req.body.status === 'active' ? 'Reactivated' : 'Deactivated'} ${target.role} ${target.email}` });
  res.json({ user: target.toSafeJSON() });
}

async function updateUser(req, res) {
  const target = await findOrgUser(req, req.params.id);
  const { firstName, lastName, email } = req.body;
  if (email && email !== target.email) {
    if (await User.exists({ email })) throw new AppError(409, 'An account with this email already exists');
    target.email = email;
  }
  if (firstName !== undefined) target.firstName = firstName;
  if (lastName !== undefined) target.lastName = lastName;
  await target.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'user.update', targetType: 'user', targetId: target._id, summary: `Updated ${target.role} ${target.email}` });
  res.json({ user: target.toSafeJSON() });
}

module.exports = {
  schemas,
  findOrgUser,
  createInvitation,
  listInvitations,
  revokeInvitation,
  listUsers,
  approveCoach,
  setUserStatus,
  updateUser,
  escapeRegex,
};

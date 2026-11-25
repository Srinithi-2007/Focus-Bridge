'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { recordAudit } = require('../services/audit');
const Organization = require('../models/Organization');
const User = require('../models/User');

const schemas = {
  updateSettings: z
    .object({
      name: z.string().trim().min(2).max(120).optional(),
      contactEmail: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).optional(),
      description: z.string().trim().max(1000).optional(),
      timezone: z.string().trim().min(1).max(64).optional(),
      programLabel: z.string().trim().min(1).max(40).optional(),
      invitations: z.object({ expiryDays: z.number().int().min(1).max(30) }).partial().optional(),
      notifications: z.object({ inviteEmails: z.boolean(), approvalEmails: z.boolean() }).partial().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update'),
};

// Role permissions are fixed in this release. Shown read-only so administrators can see what each role may do.
const ROLE_MATRIX = [
  { role: 'Administrator', access: 'Organization settings, invitations, coach approval, student and coach management, allocations, groups, programs, reports' },
  { role: 'Coach', access: 'Assigned students and groups, assigning tasks, group communication, individual reviews (Phase 3)' },
  { role: 'Student', access: 'Own profile, assigned coach, joined groups, tasks, calendar, AI assistant, progress (Phase 4)' },
];

function present(org, admins) {
  return {
    organization: {
      name: org.name,
      slug: org.slug,
      contactEmail: org.contactEmail || '',
      description: org.description || '',
      timezone: org.settings.timezone,
      programLabel: org.settings.programLabel,
    },
    invitations: { expiryDays: org.settings?.invitations?.expiryDays || 7 },
    notifications: {
      inviteEmails: org.settings?.notifications?.inviteEmails !== false,
      approvalEmails: org.settings?.notifications?.approvalEmails !== false,
    },
    roles: ROLE_MATRIX,
    administrators: admins.map((a) => ({ id: a._id.toString(), name: `${a.firstName} ${a.lastName}`.trim(), email: a.email })),
  };
}

async function getSettings(req, res) {
  const org = await Organization.findById(req.organizationId);
  if (!org) throw new AppError(404, 'Organization not found');
  const admins = await User.find({ organizationId: req.organizationId, role: 'admin', status: 'active' }).select('firstName lastName email').lean();
  res.json({ settings: present(org, admins) });
}

async function updateSettings(req, res) {
  const org = await Organization.findById(req.organizationId);
  if (!org) throw new AppError(404, 'Organization not found');
  const b = req.body;
  if (b.name !== undefined) org.name = b.name;
  if (b.contactEmail !== undefined) org.contactEmail = b.contactEmail;
  if (b.description !== undefined) org.description = b.description;
  if (b.timezone !== undefined) org.settings.timezone = b.timezone;
  if (b.programLabel !== undefined) org.settings.programLabel = b.programLabel;
  if (!org.settings.invitations) org.settings.invitations = {};
  if (b.invitations?.expiryDays !== undefined) org.settings.invitations.expiryDays = b.invitations.expiryDays;
  if (!org.settings.notifications) org.settings.notifications = {};
  if (b.notifications?.inviteEmails !== undefined) org.settings.notifications.inviteEmails = b.notifications.inviteEmails;
  if (b.notifications?.approvalEmails !== undefined) org.settings.notifications.approvalEmails = b.notifications.approvalEmails;
  await org.save();
  await recordAudit({ organizationId: req.organizationId, actorId: req.user._id, action: 'settings.update', targetType: 'organization', targetId: org._id, summary: 'Updated organization settings' });
  const admins = await User.find({ organizationId: req.organizationId, role: 'admin', status: 'active' }).select('firstName lastName email').lean();
  res.json({ settings: present(org, admins) });
}

module.exports = { schemas, getSettings, updateSettings };

'use strict';
const { z } = require('zod');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const { passwordSchema, hashPassword, verifyPassword } = require('../utils/password');
const { createOpaqueToken, hashToken } = require('../utils/tokens');
const { signSessionToken } = require('../services/tokenService');
const { sendMail } = require('../services/mailer');
const { COOKIE_NAME, CSRF_COOKIE_NAME } = require('../middleware/auth');
const env = require('../config/env');
const { connectDB } = require('../config/db');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Invitation = require('../models/Invitation');

const emailSchema = z.string().trim().toLowerCase().email().max(254);

const registerOrgSchema = z.object({
  organizationName: z.string().trim().min(2).max(120),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

const forgotSchema = z.object({ email: emailSchema });

const resetSchema = z.object({
  token: z.string().min(32).max(256),
  password: passwordSchema,
});

const acceptInviteSchema = z.object({
  token: z.string().min(32).max(256),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: passwordSchema,
});

function slugify(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'org';
  return `${base}-${new mongoose.Types.ObjectId().toString().slice(-6)}`;
}

// Precomputed dummy bcrypt hash (cost 12) for constant-time comparisons when email does not exist
const DUMMY_HASH = '$2a$12$e8Y7z7r0L81Z94vT8l5mmeW51r/P4fD1C1B0q8H0c5A2b1d3e4f5g';

function getCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  };
}

function getCsrfCookieOptions() {
  return {
    httpOnly: false,
    secure: env.isProd,
    sameSite: env.isProd ? 'none' : 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  };
}

function generateCsrfToken() {
  const crypto = require('crypto');
  return crypto.randomBytes(24).toString('hex');
}

function sessionResponse(user, res) {
  const token = signSessionToken(user);
  let csrfToken;
  if (res) {
    csrfToken = generateCsrfToken();
    res.cookie(COOKIE_NAME, token, getCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());
  }
  return { token, user: user.toSafeJSON(), ...(csrfToken ? { csrfToken } : {}) };
}

function clearAuthCookies(res) {
  res.clearCookie(COOKIE_NAME, { ...getCookieOptions(), maxAge: 0 });
  res.clearCookie(CSRF_COOKIE_NAME, { ...getCsrfCookieOptions(), maxAge: 0 });
}

async function registerOrganization(req, res) {
  await connectDB();
  const { organizationName, firstName, lastName, email, password } = req.body;
  if (await User.exists({ email })) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const org = await Organization.create({ name: organizationName, slug: slugify(organizationName) });
  const user = await User.create({
    organizationId: org._id,
    email,
    firstName,
    lastName,
    role: 'admin',
    status: 'active',
    passwordHash: await hashPassword(password),
  });

  res.status(201).json(sessionResponse(user, res));
}

async function login(req, res) {
  await connectDB();
  const { email, password } = req.body;
  // Role is never taken from the request: it is read from the stored user record.
  const user = await User.findOne({ email }).select('+passwordHash');

  // Login timing protection: execute bcrypt comparison even if user was not found
  const hashToVerify = user && user.passwordHash ? user.passwordHash : DUMMY_HASH;
  const passwordOk = await verifyPassword(password, hashToVerify);
  if (!user || !user.passwordHash || !passwordOk) {
    throw new AppError(401, 'Email or password is incorrect');
  }

  if (user.status === 'invited') throw new AppError(403, 'Activate your account using your invitation link first');
  if (user.status === 'pending_approval') throw new AppError(403, 'Your coach account is awaiting administrator approval');
  if (user.status === 'deactivated') throw new AppError(403, 'This account has been deactivated');

  user.lastLoginAt = new Date();
  await user.save();
  res.json(sessionResponse(user, res));
}

async function logout(_req, res) {
  clearAuthCookies(res);
  res.json({ message: 'Signed out successfully' });
}

async function getCsrfToken(req, res) {
  const existing = req.cookies ? req.cookies[CSRF_COOKIE_NAME] : null;
  const csrfToken = existing || generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());
  res.json({ csrfToken });
}

async function me(req, res) {
  const org = await Organization.findById(req.user.organizationId).lean();
  res.json({
    user: req.user.toSafeJSON(),
    organization: org ? { id: org._id.toString(), name: org.name } : null,
  });
}

async function forgotPassword(req, res) {
  await connectDB();
  const user = await User.findOne({ email: req.body.email, status: 'active' });
  if (user) {
    const { raw, hash } = createOpaqueToken();
    user.passwordResetTokenHash = hash;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();
    const link = `${env.clientUrl}/login?reset=${raw}`;
    await sendMail({
      to: user.email,
      subject: 'Reset your FocusBridge password',
      text: `Reset link (valid 1 hour): ${link}`,
    });
  }
  // Same response whether or not the account exists, to avoid account enumeration.
  res.json({ message: 'If an active account exists for that email, a reset link has been sent.' });
}

async function resetPassword(req, res) {
  await connectDB();
  const hash = hashToken(req.body.token);
  const user = await User.findOne({
    passwordResetTokenHash: hash,
    passwordResetExpires: { $gt: new Date() },
    status: 'active',
  }).select('+passwordResetTokenHash +passwordResetExpires');
  if (!user) throw new AppError(400, 'This reset link is invalid or has expired');

  user.passwordHash = await hashPassword(req.body.password);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  res.json({ message: 'Password updated. You can now sign in.' });
}

async function findValidInvitation(rawToken) {
  await connectDB();
  const invitation = await Invitation.findOne({
    tokenHash: hashToken(rawToken),
    acceptedAt: null,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!invitation) throw new AppError(400, 'This invitation is invalid or has expired');
  return invitation;
}

async function getInvitation(req, res) {
  const invitation = await findValidInvitation(req.params.token);
  const org = await Organization.findById(invitation.organizationId).lean();
  res.json({
    email: invitation.email,
    role: invitation.role,
    organizationName: org ? org.name : '',
  });
}

async function acceptInvitation(req, res) {
  const { token, firstName, lastName, password } = req.body;
  const invitation = await findValidInvitation(token);

  if (await User.exists({ email: invitation.email })) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const isCoach = invitation.role === 'coach';
  const user = await User.create({
    organizationId: invitation.organizationId,
    email: invitation.email,
    firstName,
    lastName,
    role: invitation.role,
    // Coaches need admin approval before they can sign in; students become active immediately.
    status: isCoach ? 'pending_approval' : 'active',
    passwordHash: await hashPassword(password),
  });

  invitation.acceptedAt = new Date();
  await invitation.save();

  if (isCoach) {
    return res.status(201).json({
      message: 'Account created. An administrator must approve your coach account before you can sign in.',
      status: user.status,
    });
  }
  return res.status(201).json(sessionResponse(user, res));
}

module.exports = {
  schemas: { registerOrgSchema, loginSchema, forgotSchema, resetSchema, acceptInviteSchema },
  registerOrganization,
  login,
  logout,
  getCsrfToken,
  me,
  forgotPassword,
  resetPassword,
  getInvitation,
  acceptInvitation,
};

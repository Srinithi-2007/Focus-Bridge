'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const env = require('../config/env');
const c = require('../controllers/authController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isProd ? 20 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please try again later.' } },
});

router.post('/register-organization', authLimiter, validate(c.schemas.registerOrgSchema), asyncHandler(c.registerOrganization));
router.post('/login', authLimiter, validate(c.schemas.loginSchema), asyncHandler(c.login));
router.post('/logout', asyncHandler(c.logout));
router.get('/csrf', asyncHandler(c.getCsrfToken));
router.get('/me', asyncHandler(authenticate), asyncHandler(c.me));
router.post('/forgot-password', authLimiter, validate(c.schemas.forgotSchema), asyncHandler(c.forgotPassword));
router.post('/reset-password', authLimiter, validate(c.schemas.resetSchema), asyncHandler(c.resetPassword));
router.get('/invitations/:token', asyncHandler(c.getInvitation));
router.post('/invitations/accept', authLimiter, validate(c.schemas.acceptInviteSchema), asyncHandler(c.acceptInvitation));

module.exports = router;

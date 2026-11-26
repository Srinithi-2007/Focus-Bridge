'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const User = require('../models/User');

const COOKIE_NAME = 'fb_session';
const CSRF_COOKIE_NAME = 'fb_csrf';

// Verifies the JWT (from httpOnly cookie or Authorization Bearer header), then loads the user from
// the database. The role and organization used for authorization always come from the stored record.
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    const cookieToken = req.cookies ? req.cookies[COOKIE_NAME] : null;
    const token = bearerToken || cookieToken;
    if (!token) throw new AppError(401, 'Authentication required');

    // When authenticating via ambient cookie, protect state-changing requests against CSRF.
    if (!bearerToken && cookieToken && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const headerCsrf = req.headers['x-csrf-token'];
      const cookieCsrf = req.cookies ? req.cookies[CSRF_COOKIE_NAME] : null;
      if (!headerCsrf || !cookieCsrf || headerCsrf !== cookieCsrf) {
        throw new AppError(403, 'CSRF verification failed: invalid or missing CSRF token');
      }
    }

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    } catch {
      throw new AppError(401, 'Session is invalid or expired');
    }

    const { connectDB } = require('../config/db');
    await connectDB();

    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') {
      throw new AppError(401, 'Account is not active');
    }
    req.user = user;
    req.organizationId = user.organizationId;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!roles.includes(req.user.role)) return next(new AppError(403, 'You do not have access to this resource'));
    return next();
  };
}

module.exports = { authenticate, requireRole, COOKIE_NAME, CSRF_COOKIE_NAME };

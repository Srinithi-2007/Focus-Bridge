'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signSessionToken(user) {
  return jwt.sign({ sub: user._id.toString() }, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
  });
}

module.exports = { signSessionToken };

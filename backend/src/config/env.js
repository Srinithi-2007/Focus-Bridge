'use strict';
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/focusbridge',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
  // AI credentials come only from the environment. Without a key the built-in planner is used.
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gemini-2.0-flash',
  isProd,
};

if (!env.jwtSecret) {
  if (isProd) {
    throw new Error('JWT_SECRET must be set in production');
  }
  // Development fallback only; never used in production.
  env.jwtSecret = 'dev-only-insecure-secret-change-me';
}

module.exports = env;

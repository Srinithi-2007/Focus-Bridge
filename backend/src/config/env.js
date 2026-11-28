'use strict';
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const defaultClientUrl = isProd ? 'https://focus-bridge-seven.vercel.app' : 'http://localhost:3000';
const rawClientUrl = process.env.CLIENT_URL || process.env.APP_BASE_URL || defaultClientUrl;
const rawAppBaseUrl = process.env.APP_BASE_URL || process.env.CLIENT_URL || defaultClientUrl;

const rawProvider = (process.env.EMAIL_PROVIDER || (process.env.EMAIL_API_KEY ? 'resend' : (process.env.SMTP_HOST ? 'smtp' : 'dev'))).trim().toLowerCase();
const rawSmtpUser = (process.env.SMTP_USER || '').trim();
const rawSmtpPassword = (process.env.SMTP_PASSWORD || '').replace(/\s+/g, '');

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/focusbridge',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  clientUrl: rawClientUrl.replace(/\/+$/, ''),
  appBaseUrl: rawAppBaseUrl.replace(/\/+$/, ''),
  // AI credentials come only from the environment. Without a key the built-in planner is used.
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gemini-2.0-flash',
  // Email configuration (Resend / SMTP / Console Dev)
  emailProvider: rawProvider,
  emailApiKey: (process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY || '').trim(),
  emailFrom: process.env.EMAIL_FROM || (rawSmtpUser ? `FocusBridge <${rawSmtpUser}>` : 'FocusBridge <notifications@focusbridge.app>'),
  // SMTP settings (optional)
  smtpHost: (process.env.SMTP_HOST || '').trim(),
  smtpPort: Number(process.env.SMTP_PORT) || 587,
  smtpUser: rawSmtpUser,
  smtpPassword: rawSmtpPassword,
  smtpSecure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
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

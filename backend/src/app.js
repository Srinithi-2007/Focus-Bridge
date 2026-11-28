'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const coachRoutes = require('./routes/coach.routes');
const studentApiRoutes = require('./routes/studentApi.routes');
const AppError = require('./utils/AppError');
const { errorHandler, notFound } = require('./middleware/errorHandler');

function normalizeOrigin(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, '').toLowerCase();
  }
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());

  const allowedOrigins = new Set([
    'https://focus-bridge-seven.vercel.app',
    normalizeOrigin(env.clientUrl),
    normalizeOrigin(env.appBaseUrl),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ].filter(Boolean));

  if (process.env.VERCEL_URL) {
    allowedOrigins.add(normalizeOrigin(`https://${process.env.VERCEL_URL}`));
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    allowedOrigins.add(normalizeOrigin(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`));
  }

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, server-to-server)
        if (!origin) {
          return callback(null, true);
        }
        const normOrigin = normalizeOrigin(origin);
        if (allowedOrigins.has(normOrigin)) {
          return callback(null, true);
        }
        // Allow any official FocusBridge Vercel preview or production subdomains
        if (
          /^https:\/\/focus-bridge[a-z0-9-]*\.vercel\.app$/i.test(normOrigin) ||
          /^https:\/\/focusbridge[a-z0-9-]*\.vercel\.app$/i.test(normOrigin)
        ) {
          return callback(null, true);
        }
        // In development, also accept any localhost/127.0.0.1 origin
        if (!env.isProd) {
          try {
            const u = new URL(normOrigin);
            if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
              return callback(null, true);
            }
          } catch {}
        }
        return callback(new AppError(403, `CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    res.json({
      status: 'ok',
      database: isConnected ? 'connected' : 'disconnected',
    });
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/coach', coachRoutes);
  app.use('/api/me', studentApiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, normalizeOrigin };

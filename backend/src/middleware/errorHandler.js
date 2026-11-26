'use strict';
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = 500;
  let message = 'Something went wrong';
  let details;

  if (err instanceof AppError) {
    status = err.status;
    message = err.message;
    details = err.details;
  } else if (err instanceof mongoose.Error.CastError || err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier format';
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
  } else if (err && err.code === 11000) {
    status = 409;
    message = 'A record with these details already exists';
  } else if (err && err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  } else if (
    err &&
    (err.name === 'MongooseServerSelectionError' ||
      err.name === 'MongoServerSelectionError' ||
      err.name === 'MongoNetworkError' ||
      err.name === 'MongoTimeoutError' ||
      (typeof err.message === 'string' && err.message.includes('buffering timed out')))
  ) {
    status = 503;
    message = 'Database service is currently unavailable. Please check your database connection or Atlas network access.';
  }

  if (status >= 500) {
    // Log full error server-side; never leak internals to the client.
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  }

  res.status(status).json({ error: { message, ...(details ? { details } : {}) } });
}

function notFound(req, _res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = { errorHandler, notFound };

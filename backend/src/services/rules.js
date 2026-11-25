'use strict';
// Pure business rules and helpers. Kept free of database calls so they can be unit tested directly.
const AppError = require('../utils/AppError');

function assertActiveCoach(user) {
  if (!user || user.role !== 'coach') throw new AppError(400, 'Selected user is not a coach');
  if (user.status !== 'active') throw new AppError(400, 'Only active coaches can be assigned');
}

function assertActiveStudent(user) {
  if (!user || user.role !== 'student') throw new AppError(400, 'Selected user is not a student');
  if (user.status !== 'active') throw new AppError(400, 'Only active students can be assigned or added to groups');
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Prevents spreadsheet formula injection when exporting CSV.
function csvEscape(value) {
  if (value === null || value === undefined) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return lines.join('\r\n') + '\r\n';
}

function clampPagination(query, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RANGE_DAYS = 366 * 2;

// Accepts ISO dates (YYYY-MM-DD). Defaults to the last 90 days. Returns inclusive start and exclusive end.
function parseDateRange(from, to, now = new Date()) {
  const end = to ? new Date(`${to}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const start = from ? new Date(`${from}T00:00:00.000Z`) : new Date(end.getTime() - 90 * DAY_MS);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new AppError(400, 'Dates must be valid YYYY-MM-DD values');
  if (start >= end) throw new AppError(400, 'The start date must be before the end date');
  if ((end - start) / DAY_MS > MAX_RANGE_DAYS) throw new AppError(400, 'Date range cannot exceed two years');
  // End is treated as inclusive by the caller: add one day to `to` so the chosen end day is included.
  return { start, end: new Date(end.getTime() + (to ? DAY_MS : 0)) };
}

module.exports = {
  assertActiveCoach,
  assertActiveStudent,
  escapeRegex,
  csvEscape,
  toCsv,
  clampPagination,
  parseDateRange,
};

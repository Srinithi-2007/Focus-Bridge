'use strict';
// Student-facing API (Phase 4). Mounted under /api/me. Student role only.
const express = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const p = require('../controllers/studentPortalController');
const w = require('../controllers/studentWorkspaceController');
const pl = require('../controllers/studentPlanController');

const router = express.Router();
router.use(asyncHandler(authenticate), requireRole('student'));

// Dashboard, tasks and submissions
router.get('/dashboard', asyncHandler(w.getDashboard));
router.get('/tasks', asyncHandler(p.listMyTasks));
router.post('/tasks/:id/submission', validate(p.schemas.submit), asyncHandler(p.submitTask));

// Plans (AI or built-in proposals; nothing reaches the calendar until approved)
router.post('/tasks/:id/plans', asyncHandler(pl.generatePlan));
router.get('/plans', asyncHandler(pl.listPlans));
router.get('/plans/:id', asyncHandler(pl.getPlan));
router.patch('/plans/:id', validate(pl.schemas.updatePlan), asyncHandler(pl.updatePlan));
router.post('/plans/:id/approve', asyncHandler(pl.approvePlan));
router.post('/plans/:id/reject', asyncHandler(pl.rejectPlan));
router.post('/plans/:id/reschedule', asyncHandler(pl.reschedule));
router.patch('/plans/:id/subtasks/:subtaskId', validate(pl.schemas.toggle), asyncHandler(pl.toggleSubtask));

// Calendar
router.get('/calendar', validate(pl.schemas.calendarQuery, 'query'), asyncHandler(pl.getCalendar));
router.patch('/calendar/events/:id', validate(pl.schemas.toggle), asyncHandler(pl.toggleEvent));

// Assistant
router.post('/assistant/chat', validate(pl.schemas.chat), asyncHandler(pl.assistantChat));

// Coach relationship, messages and feedback
router.get('/coach', asyncHandler(w.getCoach));
router.post('/coach/messages', validate(w.schemas.message), asyncHandler(w.postMessage));

// Groups
router.get('/groups', asyncHandler(p.listMyGroups));
router.get('/groups/:id', asyncHandler(w.getGroup));
router.post('/groups/:id/posts', validate(p.schemas.post), asyncHandler(p.postToGroup));

// Progress, notifications, settings
router.get('/progress', asyncHandler(w.getProgress));
router.get('/notifications', validate(w.schemas.notificationsQuery, 'query'), asyncHandler(w.listNotifications));
router.post('/notifications/read-all', asyncHandler(w.markAllRead));
router.post('/notifications/:id/read', asyncHandler(w.markRead));
router.get('/settings', asyncHandler(w.getSettings));
router.patch('/settings', validate(w.schemas.settings), asyncHandler(w.updateSettings));
router.post('/security/password', validate(w.schemas.password), asyncHandler(w.changePassword));

module.exports = router;

'use strict';
const express = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const a = require('../controllers/adminController');
const s = require('../controllers/studentController');
const c = require('../controllers/coachController');
const al = require('../controllers/allocationController');
const g = require('../controllers/groupController');
const p = require('../controllers/programController');
const r = require('../controllers/reportController');
const st = require('../controllers/settingsController');
const d = require('../controllers/dashboardController');

const router = express.Router();

// Admin-only for every route below. The role comes from the database-verified user (see middleware/auth.js).
router.use(asyncHandler(authenticate), requireRole('admin'));

// Dashboard
router.get('/dashboard', asyncHandler(d.getDashboard));

// Invitations
router.post('/invitations', validate(a.schemas.createInvitation), asyncHandler(a.createInvitation));
router.get('/invitations', validate(a.schemas.listInvitations, 'query'), asyncHandler(a.listInvitations));
router.delete('/invitations/:id', asyncHandler(a.revokeInvitation));

// Users (generic lists and actions shared by coach and student screens)
router.get('/users', validate(a.schemas.listUsers, 'query'), asyncHandler(a.listUsers));
router.patch('/users/:id', validate(a.schemas.updateUser), asyncHandler(a.updateUser));
router.patch('/users/:id/approve', asyncHandler(a.approveCoach));
router.patch('/users/:id/status', validate(a.schemas.setStatus), asyncHandler(a.setUserStatus));

// Students
router.get('/students', validate(s.schemas.listStudents, 'query'), asyncHandler(s.listStudents));
router.patch('/students/:id', validate(s.schemas.updateStudent), asyncHandler(s.updateStudent));

// Coaches
router.get('/coaches', validate(c.schemas.listCoaches, 'query'), asyncHandler(c.listCoaches));

// Allocations
router.get('/allocations', asyncHandler(al.getAllocations));
router.put('/students/:id/coach', validate(al.schemas.assignCoach), asyncHandler(al.assignCoach));

// Groups
router.get('/groups', asyncHandler(g.listGroups));
router.post('/groups', validate(g.schemas.createGroup), asyncHandler(g.createGroup));
router.get('/groups/:id', asyncHandler(g.getGroup));
router.patch('/groups/:id', validate(g.schemas.updateGroup), asyncHandler(g.updateGroup));
router.delete('/groups/:id', asyncHandler(g.deleteGroup));
router.post('/groups/:id/members', validate(g.schemas.addMembers), asyncHandler(g.addMembers));
router.delete('/groups/:id/members/:studentId', asyncHandler(g.removeMember));

// Programs
router.get('/programs', asyncHandler(p.listPrograms));
router.post('/programs', validate(p.schemas.programBody), asyncHandler(p.createProgram));
router.patch('/programs/:id', validate(p.schemas.updateProgram), asyncHandler(p.updateProgram));
router.delete('/programs/:id', asyncHandler(p.deleteProgram));

// Reports
router.get('/reports', validate(r.schemas.range, 'query'), asyncHandler(r.getReports));
router.get('/reports/export', validate(r.schemas.export, 'query'), asyncHandler(r.exportReport));

// Settings
router.get('/settings', asyncHandler(st.getSettings));
router.patch('/settings', validate(st.schemas.updateSettings), asyncHandler(st.updateSettings));

module.exports = router;

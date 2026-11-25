'use strict';
const express = require('express');
const validate = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const t = require('../controllers/coachTaskController');
const s = require('../controllers/coachStudentController');
const g = require('../controllers/coachGroupController');
const r = require('../controllers/coachReviewController');
const a = require('../controllers/coachActivityController');
const d = require('../controllers/coachDashboardController');
const m = require('../controllers/coachMessageController');

const router = express.Router();

// Coach-only. Admins and students receive 403. Coach identity always comes from the database-verified user.
router.use(asyncHandler(authenticate), requireRole('coach'));

router.get('/dashboard', asyncHandler(d.getDashboard));

router.get('/students', validate(s.schemas.listStudents, 'query'), asyncHandler(s.listStudents));
router.get('/students/:id', asyncHandler(s.getStudent));
router.post('/students/:id/notes', validate(s.schemas.note), asyncHandler(s.addNote));
router.delete('/students/:id/notes/:noteId', asyncHandler(s.deleteNote));
router.get('/students/:id/messages', asyncHandler(m.listMessages));
router.post('/students/:id/messages', validate(m.schemas.reply), asyncHandler(m.reply));

router.get('/groups', asyncHandler(g.listGroups));
router.get('/groups/:id', asyncHandler(g.getGroup));
router.post('/groups/:id/posts', validate(g.schemas.post), asyncHandler(g.createPost));
router.delete('/groups/:id/posts/:postId', asyncHandler(g.deletePost));
router.post('/groups/:id/resources', validate(g.schemas.resource), asyncHandler(g.addResource));
router.delete('/groups/:id/resources/:resourceId', asyncHandler(g.deleteResource));

router.get('/tasks', validate(t.schemas.listTasks, 'query'), asyncHandler(t.listTasks));
router.post('/tasks', validate(t.schemas.createTask), asyncHandler(t.createTask));
router.get('/tasks/:id', asyncHandler(t.getTask));
router.patch('/tasks/:id', validate(t.schemas.updateTask), asyncHandler(t.updateTask));
router.post('/tasks/:id/publish', asyncHandler(t.publishTask));
router.post('/tasks/:id/archive', asyncHandler(t.archiveTask));
router.delete('/tasks/:id', asyncHandler(t.deleteTask));
router.post('/submissions/:id/feedback', validate(t.schemas.feedback), asyncHandler(t.giveFeedback));

router.get('/reviews', validate(r.schemas.listReviews, 'query'), asyncHandler(r.listReviews));
router.post('/reviews', validate(r.schemas.createReview), asyncHandler(r.createReview));
router.get('/reviews/:id', asyncHandler(r.getReview));
router.patch('/reviews/:id', validate(r.schemas.updateReview), asyncHandler(r.updateReview));

router.get('/activities', validate(a.schemas.listActivities, 'query'), asyncHandler(a.listActivities));
router.post('/activities', validate(a.schemas.createActivity), asyncHandler(a.createActivity));
router.patch('/activities/:id', validate(a.schemas.updateActivity), asyncHandler(a.updateActivity));
router.post('/activities/:id/complete', asyncHandler(a.completeActivity));
router.post('/activities/:id/cancel', asyncHandler(a.cancelActivity));

router.get('/reports', validate(d.schemas.reports, 'query'), asyncHandler(d.getReports));
router.get('/reports/export', validate(d.schemas.export, 'query'), asyncHandler(d.exportReport));

module.exports = router;

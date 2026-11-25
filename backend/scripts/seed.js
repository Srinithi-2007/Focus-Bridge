'use strict';
// Seeds realistic demo data for local development. Refuses to run in production.
// Usage: npm run seed   (set SEED_PASSWORD in .env to change the demo password)
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { connectDB } = require('../src/config/db');
const { hashPassword } = require('../src/utils/password');
const Organization = require('../src/models/Organization');
const User = require('../src/models/User');
const Program = require('../src/models/Program');
const Group = require('../src/models/Group');
const Task = require('../src/models/Task');
const Submission = require('../src/models/Submission');
const Review = require('../src/models/Review');
const GroupPost = require('../src/models/GroupPost');
const GroupResource = require('../src/models/GroupResource');
const Activity = require('../src/models/Activity');
const StudentProfile = require('../src/models/StudentProfile');
const Plan = require('../src/models/Plan');
const CalendarEvent = require('../src/models/CalendarEvent');
const Notification = require('../src/models/Notification');
const Message = require('../src/models/Message');

const DEMO_SLUG = 'northwind-learning-demo';

async function main() {
  if (env.isProd) {
    throw new Error('Seeding is disabled in production');
  }
  if (mongoose.connection.readyState !== 1) {
    await connectDB();
  }

  const existing = await Organization.findOne({ slug: DEMO_SLUG });
  if (existing) {
    console.log('Demo organization already exists; nothing to do. Drop the database to reseed.');
    return;
  }

  const password = process.env.SEED_PASSWORD || 'DemoPass123';
  const passwordHash = await hashPassword(password);

  const org = await Organization.create({
    name: 'Northwind Learning Institute',
    slug: DEMO_SLUG,
    contactEmail: 'contact@northwind.demo.test',
    description: 'Premier coaching institute for executive function and study skills.',
    settings: {
      timezone: 'America/New_York',
      programLabel: 'Coaching Track',
      invitations: { expiryDays: 7 },
      notifications: { inviteEmails: true, approvalEmails: true },
    },
  });
  const base = { organizationId: org._id, passwordHash };

  const admin = await User.create({
    ...base,
    email: 'admin@demo.focusbridge.test',
    firstName: 'Priya',
    lastName: 'Raman',
    role: 'admin',
    status: 'active',
  });

  const coaches = await User.create([
    { ...base, email: 'coach.lee@demo.focusbridge.test', firstName: 'Jordan', lastName: 'Lee', role: 'coach', status: 'active' },
    { ...base, email: 'coach.okafor@demo.focusbridge.test', firstName: 'Ada', lastName: 'Okafor', role: 'coach', status: 'active' },
    { ...base, email: 'coach.new@demo.focusbridge.test', firstName: 'Sam', lastName: 'Patel', role: 'coach', status: 'pending_approval' },
  ]);

  const programs = await Program.create([
    {
      organizationId: org._id,
      name: 'Executive Function Mastery',
      description: 'Foundations of time management, task breakdown and self-monitoring.',
      coachingAreas: ['Planning', 'Prioritization', 'Task Initiation'],
    },
    {
      organizationId: org._id,
      name: 'Academic Writing & Research',
      description: 'Structured workflows for long-form essays, research papers and revisions.',
      coachingAreas: ['Outlining', 'Drafting', 'Revision Cycles'],
    },
  ]);

  const students = [
    ['alex.rivera', 'Alex', 'Rivera', coaches[0], programs[0]._id],
    ['maya.chen', 'Maya', 'Chen', coaches[0], programs[0]._id],
    ['leo.santos', 'Leo', 'Santos', coaches[1], programs[1]._id],
    ['zara.ahmed', 'Zara', 'Ahmed', coaches[1], programs[1]._id],
  ];

  const studentDocs = await User.create(
    students.map(([handle, firstName, lastName, coach, programId]) => ({
      ...base,
      email: `${handle}@demo.focusbridge.test`,
      firstName,
      lastName,
      role: 'student',
      status: 'active',
      coachId: coach._id,
      programId,
    }))
  );

  const groupDocs = await Group.create([
    {
      organizationId: org._id,
      name: 'Cohort Alpha - Fall 2026',
      description: 'Weekly accountability and strategy group for freshman cohort.',
      coachId: coaches[0]._id,
      programId: programs[0]._id,
      memberIds: [studentDocs[0]._id, studentDocs[1]._id],
    },
    {
      organizationId: org._id,
      name: 'Focus Lab Beta',
      description: 'Intensive body-doubling and writing accountability group.',
      coachId: coaches[1]._id,
      programId: programs[1]._id,
      memberIds: [studentDocs[2]._id, studentDocs[3]._id],
    },
  ]);

  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const publishedTask = await Task.create({
    organizationId: org._id,
    coachId: coaches[0]._id,
    title: 'Weekly Focus & Time-Blocking Plan',
    instructions: 'Map out your top three academic priorities and block two 45-minute focus sessions for each.',
    priority: 'high',
    deadline: new Date(now + 4 * DAY),
    audience: 'group',
    groupId: groupDocs[0]._id,
    status: 'published',
    publishedAt: new Date(now - DAY),
    originalInstructions: 'Map out your top three academic priorities and block two 45-minute focus sessions for each.',
    originalDeadline: new Date(now + 4 * DAY),
  });

  await Task.create({
    organizationId: org._id,
    coachId: coaches[0]._id,
    title: 'Mid-Week Reflection Check-In',
    instructions: 'Summarize what worked well in your study routine and one adjustment for next week.',
    priority: 'medium',
    deadline: new Date(now + 7 * DAY),
    audience: 'student',
    studentId: studentDocs[0]._id,
    status: 'draft',
  });

  await Submission.create({
    organizationId: org._id,
    taskId: publishedTask._id,
    studentId: studentDocs[0]._id,
    body: 'Blocked Monday and Wednesday mornings for calculus problem sets and Friday for essay outlining.',
    status: 'submitted',
    submittedAt: new Date(now - 2 * 60 * 60 * 1000),
    late: false,
  });

  await Review.create({
    organizationId: org._id,
    coachId: coaches[0]._id,
    studentId: studentDocs[0]._id,
    status: 'submitted',
    strengths: 'Consistent follow-through on morning study blocks and proactive task breakdown.',
    challenges: 'Transitioning into longer writing tasks without procrastination.',
    observations: 'Submitted recent assignments ahead of schedule with clear structure.',
    recommendations: 'Use a 10-minute warm-up outline before each drafting block.',
    nextGoals: 'Complete two structured writing outlines before next week.',
    submittedAt: new Date(now - 5 * DAY),
  });

  await GroupPost.create({
    organizationId: org._id,
    groupId: groupDocs[0]._id,
    authorId: coaches[0]._id,
    kind: 'announcement',
    body: 'Welcome to Cohort Alpha! Please review the weekly time-blocking guide before our upcoming planning session.',
  });

  await GroupResource.create({
    organizationId: org._id,
    groupId: groupDocs[0]._id,
    uploaderId: coaches[0]._id,
    title: 'Weekly Time-Blocking Template',
    url: 'https://example.org/focusbridge/time-blocking-template',
  });

  await Activity.create({
    organizationId: org._id,
    coachId: coaches[0]._id,
    groupId: groupDocs[0]._id,
    title: 'Weekly Planning & Accountability Circle',
    description: 'Group session to review weekly schedules and identify potential roadblocks.',
    location: 'Room 204 / Online Meeting Link',
    startsAt: new Date(now + 2 * DAY),
    endsAt: new Date(now + 2 * DAY + 60 * 60 * 1000),
    status: 'scheduled',
  });

  const weekAvail = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: '09:00', end: '18:00' }));
  await StudentProfile.create({
    organizationId: org._id,
    userId: studentDocs[0]._id,
    availability: weekAvail,
    preferences: { reminderLeadMinutes: 60, emailReminders: true },
    accessibility: { fontScale: 'default', highContrast: false, reducedMotion: false },
  });

  const plan = await Plan.create({
    organizationId: org._id,
    studentId: studentDocs[0]._id,
    taskId: publishedTask._id,
    status: 'approved',
    source: 'planner',
    sourceNote: 'Demo approved study schedule',
    subtasks: [
      { title: 'Outline top three priorities', estimateMinutes: 30, done: true },
      { title: 'Block first two 45-min study sessions', estimateMinutes: 45, done: false },
      { title: 'Finalize calendar and submit verification', estimateMinutes: 20, done: false },
    ],
    blocks: [
      { subtaskId: new mongoose.Types.ObjectId(), start: new Date(now + 2 * 3600000), end: new Date(now + 3 * 3600000) },
    ],
    feasible: true,
    approvedAt: new Date(now - 12 * 3600000),
  });

  await CalendarEvent.create({
    organizationId: org._id,
    userId: studentDocs[0]._id,
    planId: plan._id,
    taskId: publishedTask._id,
    subtaskId: plan.subtasks[1]._id,
    title: `${publishedTask.title}: Block first two 45-min study sessions`,
    start: new Date(now + 2 * 3600000),
    end: new Date(now + 3 * 3600000),
    done: false,
  });

  await Message.create([
    {
      organizationId: org._id,
      studentId: studentDocs[0]._id,
      coachId: coaches[0]._id,
      from: 'student',
      body: 'Hi Coach Lee, I created my weekly time-blocking plan and submitted my first reflection.',
      createdAt: new Date(now - 3 * 3600000),
    },
    {
      organizationId: org._id,
      studentId: studentDocs[0]._id,
      coachId: coaches[0]._id,
      from: 'coach',
      body: 'Great work Alex! I reviewed your submission and left some feedback. Keep up the momentum.',
      createdAt: new Date(now - 1 * 3600000),
    },
  ]);

  await Notification.create([
    {
      organizationId: org._id,
      userId: studentDocs[0]._id,
      type: 'task',
      title: 'New task assigned',
      body: publishedTask.title,
      link: '/student/tasks',
      createdAt: new Date(now - 24 * 3600000),
    },
    {
      organizationId: org._id,
      userId: studentDocs[0]._id,
      type: 'feedback',
      title: 'New feedback from your coach',
      body: `Feedback on "${publishedTask.title}"`,
      link: '/student/tasks',
      createdAt: new Date(now - 2 * 3600000),
    },
  ]);

  console.log('Seeded demo organization:', org.name);
  console.log('  Admin:  ', admin.email);
  console.log('  Coaches:', coaches.map((c) => c.email).join(', '));
  console.log('  Students: alex.rivera, maya.chen, leo.santos, zara.ahmed @demo.focusbridge.test');
  console.log('  Programs:', programs.map((p) => p.name).join(', '));
  console.log(`  Password for all demo accounts: ${password}`);
}

module.exports = { seed: main };

if (require.main === module) {
  main()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err.message);
      try {
        await mongoose.disconnect();
      } catch (_) {}
      process.exit(1);
    });
}

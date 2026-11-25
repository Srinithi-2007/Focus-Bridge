'use strict';
// Coach side of the asynchronous direct line. Only the coach allocated to the student can read or reply.
const { z } = require('zod');
const { getAllocatedStudent } = require('../services/coachAccess');
const { notify } = require('../services/notifications');
const Message = require('../models/Message');

const schemas = { reply: z.object({ body: z.string().trim().min(1).max(2000) }) };

async function listMessages(req, res) {
  const coach = req.user;
  const student = await getAllocatedStudent(coach, req.params.id);
  const msgs = await Message.find({ organizationId: coach.organizationId, studentId: student._id, coachId: coach._id }).sort({ createdAt: -1 }).limit(100).lean();
  await Message.updateMany({ organizationId: coach.organizationId, studentId: student._id, coachId: coach._id, from: 'student', readAt: null }, { readAt: new Date() });
  res.json({ messages: msgs.reverse().map((m) => ({ id: String(m._id), from: m.from, body: m.body, createdAt: m.createdAt })) });
}

async function reply(req, res) {
  const coach = req.user;
  const student = await getAllocatedStudent(coach, req.params.id);
  const msg = await Message.create({ organizationId: coach.organizationId, studentId: student._id, coachId: coach._id, from: 'coach', body: req.body.body });
  await notify({ organizationId: coach.organizationId, userId: student._id, type: 'message', title: 'New message from your coach', body: req.body.body.slice(0, 140), link: '/student/coach' });
  res.status(201).json({ message: { id: String(msg._id), from: msg.from, body: msg.body, createdAt: msg.createdAt } });
}

module.exports = { schemas, listMessages, reply };

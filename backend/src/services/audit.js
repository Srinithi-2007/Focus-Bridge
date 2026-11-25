'use strict';
const AuditLog = require('../models/AuditLog');

// Fire-and-forget audit write. A failed audit write must not break the admin action itself, but is logged.
async function recordAudit({ organizationId, actorId, action, targetType = '', targetId = '', summary = '' }) {
  try {
    await AuditLog.create({
      organizationId,
      actorId,
      action,
      targetType,
      targetId: String(targetId || ''),
      summary: summary.slice(0, 300),
    });
  } catch (err) {
    console.error('[audit] failed to record', action, err.message);
  }
}

module.exports = { recordAudit };

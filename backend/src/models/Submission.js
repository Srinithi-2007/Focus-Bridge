'use strict';
const mongoose = require('mongoose');

// One submission per student per task. Resubmissions update the same record and increase `attempts`.
const submissionSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, default: '', maxlength: 5000 },
    attachments: { type: [{ name: String, url: String }], default: [] },
    status: { type: String, enum: ['submitted', 'reviewed'], default: 'submitted' },
    submittedAt: { type: Date, required: true },
    attempts: { type: Number, default: 1 },
    late: { type: Boolean, default: false },
    feedback: { type: String, default: '', maxlength: 3000 },
    feedbackAt: { type: Date, default: null },
    feedbackById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

submissionSchema.index({ taskId: 1, studentId: 1 }, { unique: true });
submissionSchema.index({ organizationId: 1, studentId: 1 });
submissionSchema.index({ organizationId: 1, status: 1 });

module.exports = mongoose.model('Submission', submissionSchema);

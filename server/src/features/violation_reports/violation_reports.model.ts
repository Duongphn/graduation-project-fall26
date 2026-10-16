import { Schema, model, type InferSchemaType } from 'mongoose';

import { reportActions, reportTargetKinds } from '../../shared/domain/enums.js';
import { reportStatuses } from '../../shared/domain/statuses.js';

const violationReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    target: {
      kind: { type: String, enum: reportTargetKinds, required: true },
      id: { type: Schema.Types.ObjectId, required: true },
      // The user responsible for the target (the owner of the toy, the sender of the message).
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    reason: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    evidence: {
      type: [String],
      validate: {
        validator: (value: string[]) => value.length <= 10,
        message: 'At most 10 photos.',
      },
    },
    status: { type: String, enum: reportStatuses, required: true, default: 'PENDING' },
    // Decided by an Admin by hand (LI-03).
    resolution: {
      action: { type: String, enum: reportActions },
      note: { type: String, trim: true, maxlength: 1000 },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
    },
  },
  { collection: 'violation_reports', timestamps: true },
);

violationReportSchema.pre('validate', function requireResolution() {
  if (this.status !== 'PENDING' && (!this.resolution?.action || !this.resolution.by)) {
    this.invalidate('resolution', 'A processed report needs the action and the Admin.');
  }
});

// GB-37: one open report per reporter and target.
violationReportSchema.index(
  { reporterId: 1, 'target.kind': 1, 'target.id': 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'PENDING' },
    name: 'one_pending_per_reporter_and_target',
  },
);
violationReportSchema.index({ status: 1, createdAt: -1 }, { name: 'admin_queue' });
violationReportSchema.index({ 'target.kind': 1, 'target.id': 1 }, { name: 'by_target' });
violationReportSchema.index(
  { 'target.userId': 1, createdAt: -1 },
  { partialFilterExpression: { 'target.userId': { $type: 'objectId' } }, name: 'by_reported_user' },
);

export type ViolationReport = InferSchemaType<typeof violationReportSchema>;
export const ViolationReportModel = model('ViolationReport', violationReportSchema);

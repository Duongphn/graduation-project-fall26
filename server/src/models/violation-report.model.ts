import mongoose, { type Model, Schema } from 'mongoose';

import {
  lockDurations,
  reportActions,
  reportReasons,
  reportStatuses,
  reportTargetKinds,
  unsafeIssues,
  type LockDuration,
  type ReportAction,
  type ReportReason,
  type ReportStatus,
  type ReportTargetKind,
  type UnsafeIssue,
} from '../constants/violation-report.js';

// A member's report about a toy post, a user or a message (UC28), handled by an Admin (UC29).

const violationReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    target: {
      kind: { type: String, required: true, enum: reportTargetKinds },
      id: { type: Schema.Types.ObjectId, required: true },
      // The user who owns the reported item (the toy owner, the message sender, the user).
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    reason: { type: String, required: true, enum: reportReasons },
    // Unsafe toy reports first in the Admin list (GB-49).
    isUnsafe: { type: Boolean, required: true, default: false },
    unsafeIssues: { type: [String], enum: unsafeIssues, default: undefined },
    description: { type: String, required: true },
    // Private photos (Cloudinary "authenticated", purpose REPORT_EVIDENCE).
    evidence: {
      type: [
        {
          _id: false,
          publicId: { type: String, required: true },
          format: { type: String, required: true },
        },
      ],
      default: undefined,
    },
    status: { type: String, required: true, enum: reportStatuses, default: 'pending' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolution: {
      action: { type: String, enum: reportActions },
      lockDuration: { type: String, enum: lockDurations },
      note: { type: String },
      resolvedAt: { type: Date },
      // Set when the report was closed together with another report on the same target.
      viaReportId: { type: Schema.Types.ObjectId },
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
violationReportSchema.index(
  { reporterId: 1, 'target.kind': 1, 'target.id': 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
    name: 'one_pending_per_reporter_and_target',
  },
);
violationReportSchema.index({ status: 1, createdAt: -1 }, { name: 'admin_queue' });
violationReportSchema.index({ 'target.kind': 1, 'target.id': 1 }, { name: 'by_target' });
violationReportSchema.index(
  { 'target.userId': 1, createdAt: -1 },
  { partialFilterExpression: { 'target.userId': { $exists: true } }, name: 'by_reported_user' },
);
// Spam guard: reports of one reporter in the last 24 hours.
violationReportSchema.index({ reporterId: 1, createdAt: -1 }, { name: 'by_reporter' });

export interface IViolationReport {
  _id: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  target: { kind: ReportTargetKind; id: mongoose.Types.ObjectId; userId?: mongoose.Types.ObjectId };
  reason: ReportReason;
  isUnsafe: boolean;
  unsafeIssues?: UnsafeIssue[];
  description: string;
  evidence?: Array<{ publicId: string; format: string }>;
  status: ReportStatus;
  resolvedBy?: mongoose.Types.ObjectId;
  resolution?: {
    action?: ReportAction;
    lockDuration?: LockDuration;
    note?: string;
    resolvedAt?: Date;
    viaReportId?: mongoose.Types.ObjectId;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const ViolationReport: Model<IViolationReport> =
  (mongoose.models.ViolationReport as Model<IViolationReport>) ||
  mongoose.model<IViolationReport>('ViolationReport', violationReportSchema);

export default ViolationReport;

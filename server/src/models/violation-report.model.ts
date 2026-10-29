import mongoose, { Schema } from 'mongoose';

const violationReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    target: {
      kind: { type: String, required: true },
      id: { type: Schema.Types.ObjectId, required: true },
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    reason: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, required: true, default: 'pending' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

export const ViolationReport =
  mongoose.models.ViolationReport || mongoose.model('ViolationReport', violationReportSchema);

export default ViolationReport;

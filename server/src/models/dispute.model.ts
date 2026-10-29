import mongoose, { type Model, Schema, type Types } from 'mongoose';

export interface IDispute {
  _id: Types.ObjectId;
  code: string;
  orderType: string;
  orderId: Types.ObjectId;
  claimantId: Types.ObjectId;
  respondentId: Types.ObjectId;
  reason: string;
  description: string;
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  openedAt: Date;
  timer?: {
    dueAt?: Date;
  };
  resolvedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const disputeSchema = new Schema<IDispute>(
  {
    code: { type: String, required: true },
    orderType: { type: String, required: true }, // rental_order hoặc purchase_order
    orderId: { type: Schema.Types.ObjectId, required: true },
    claimantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    respondentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, required: true, default: 'open' }, // open, under_review, resolved, closed
    openedAt: { type: Date, default: Date.now },
    timer: {
      dueAt: { type: Date },
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
disputeSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
disputeSchema.index(
  { orderType: 1, orderId: 1 },
  { unique: true, partialFilterExpression: { status: 'open' }, name: 'one_open_per_order' },
);
disputeSchema.index({ status: 1, openedAt: 1 }, { name: 'admin_queue' });
disputeSchema.index({ claimantId: 1, openedAt: -1 }, { name: 'claimant_disputes' });
disputeSchema.index({ respondentId: 1, openedAt: -1 }, { name: 'respondent_disputes' });
disputeSchema.index(
  { 'timer.dueAt': 1 },
  { partialFilterExpression: { 'timer.dueAt': { $exists: true } }, name: 'timer_due' },
);

export const Dispute: Model<IDispute> =
  (mongoose.models.Dispute as Model<IDispute>) || mongoose.model<IDispute>('Dispute', disputeSchema);

export default Dispute;

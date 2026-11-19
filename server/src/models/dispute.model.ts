import mongoose, { type Model, Schema, type Types } from 'mongoose';
import { DISPUTE_VERDICTS, type DisputeStatus, type DisputeVerdict } from '../constants/dispute.js';
import { type RentalPhoto } from './rental-order.model.js';

export interface IDispute {
  _id: Types.ObjectId;
  code: string;
  orderType: string;
  orderId: Types.ObjectId;
  claimantId: Types.ObjectId;
  respondentId: Types.ObjectId;
  // Same shape as ClaimantRole in services/rental-pricing.ts (models may not import services)
  claimantRole: 'renter' | 'owner';
  reason: string;
  description: string;
  evidencePhotos: RentalPhoto[];
  status: DisputeStatus;
  openedAt: Date;
  timer?: {
    dueAt?: Date;
  };
  response?: { message: string; photos: RentalPhoto[]; respondedAt: Date };
  reviewStartedAt?: Date;
  responseMissed?: boolean;
  resolution?: {
    verdict: DisputeVerdict;
    compensation: number;
    reason: string;
    resolvedAt: Date;
    payout: { renter: number; owner: number; platform: number }; // same shape as Payout in rental-pricing.ts
  };
  resolvedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const photoSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false },
);

const disputeSchema = new Schema<IDispute>(
  {
    code: { type: String, required: true },
    orderType: { type: String, required: true }, // rental_order hoặc purchase_order
    orderId: { type: Schema.Types.ObjectId, required: true },
    claimantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    respondentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    claimantRole: { type: String, required: true, enum: ['renter', 'owner'] },
    reason: { type: String, required: true },
    description: { type: String, required: true },
    evidencePhotos: { type: [photoSchema], default: [] },
    status: { type: String, required: true, default: 'open' }, // open, under_review, resolved, closed
    openedAt: { type: Date, default: Date.now },
    timer: {
      dueAt: { type: Date },
    },
    response: {
      type: new Schema(
        {
          message: { type: String, required: true },
          photos: { type: [photoSchema], default: [] },
          respondedAt: { type: Date, required: true },
        },
        { _id: false },
      ),
    },
    reviewStartedAt: { type: Date },
    responseMissed: { type: Boolean },
    resolution: {
      type: new Schema(
        {
          verdict: { type: String, required: true, enum: DISPUTE_VERDICTS },
          compensation: { type: Number, required: true },
          reason: { type: String, required: true },
          resolvedAt: { type: Date, required: true },
          payout: {
            renter: { type: Number, required: true },
            owner: { type: Number, required: true },
            platform: { type: Number, required: true },
          },
        },
        { _id: false },
      ),
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
disputeSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
disputeSchema.index({ orderType: 1, orderId: 1 }, { unique: true, name: 'one_per_order' });
disputeSchema.index({ status: 1, reviewStartedAt: 1 }, { name: 'review_queue' });
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

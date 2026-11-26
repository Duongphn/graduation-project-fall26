import mongoose, { type Model, Schema, type Types } from 'mongoose';
import { compensationRates, disputeRulings, type DisputeRuling } from '../constants/dispute-ruling.js';
import { type ToyImage } from '../interfaces/toy-listing.ports.js';

const photoSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false },
);

/** Phán quyết của Admin (UC19). Ghi một lần, không sửa được (GB-26). */
export interface IDisputeResolution {
  ruling: DisputeRuling;
  compensationRate: number;
  /** K: phần cọc bồi thường cho chủ đồ */
  compensationAmount: number;
  /** G: phần tiền thuê hoàn cho người thuê */
  rentRefundAmount: number;
  /** Số tiền mỗi bên nhận từ escrow theo phán quyết */
  ownerAmount: number;
  renterAmount: number;
  platformFee: number;
  /** Lý do gửi cho cả hai bên, 30–500 ký tự */
  adminDecision: string;
}

/** Phản hồi một lần của bên bị khiếu nại trong hạn 72 giờ (UC18, GB-24). */
export interface IDisputeResponse {
  message: string;
  photos: ToyImage[];
  respondedAt: Date;
}

export interface IDispute {
  _id: Types.ObjectId;
  code: string;
  orderType: string;
  orderId: Types.ObjectId;
  claimantId: Types.ObjectId;
  respondentId: Types.ObjectId;
  reason: string;
  description: string;
  /** Ảnh bằng chứng khi người thuê khiếu nại (UC17); khiếu nại của chủ đồ dùng settlement.evidencePhotos của đơn */
  evidencePhotos?: ToyImage[];
  response?: IDisputeResponse;
  status: 'open' | 'under_review' | 'resolved' | 'closed';
  openedAt: Date;
  timer?: {
    dueAt?: Date;
  };
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  resolution?: IDisputeResolution;
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
    evidencePhotos: { type: [photoSchema], default: undefined },
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
    status: { type: String, required: true, default: 'open' }, // open, under_review, resolved, closed
    openedAt: { type: Date, default: Date.now },
    // Hạn bên bị khiếu nại phản hồi (72 giờ, GB-24); Admin quyết định sau hạn này (UC19)
    timer: {
      dueAt: { type: Date },
    },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    resolution: {
      type: new Schema(
        {
          ruling: { type: String, enum: disputeRulings, required: true },
          compensationRate: { type: Number, enum: compensationRates, required: true },
          compensationAmount: { type: Number, required: true, min: 0 },
          rentRefundAmount: { type: Number, required: true, min: 0 },
          ownerAmount: { type: Number, required: true, min: 0 },
          renterAmount: { type: Number, required: true, min: 0 },
          platformFee: { type: Number, required: true, min: 0 },
          adminDecision: { type: String, required: true },
        },
        { _id: false },
      ),
    },
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

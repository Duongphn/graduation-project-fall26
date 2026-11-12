import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export interface IBankInfo {
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
}

export type WithdrawalStatus = 'pending' | 'approved' | 'rejected';

export interface IWithdrawalRequest extends Document {
  _id: Types.ObjectId;
  code?: string | undefined;
  userId: Types.ObjectId;
  amount: number;
  bankInfo: IBankInfo;
  status: WithdrawalStatus;
  processedBy?: Types.ObjectId | undefined;
  notes?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

const withdrawalRequestSchema = new Schema(
  {
    code: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    bankInfo: {
      bankName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      accountHolderName: { type: String, required: true },
    },
    status: { type: String, required: true, default: 'pending' },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
withdrawalRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_user' },
);
withdrawalRequestSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_requests' });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 }, { name: 'admin_queue' });
withdrawalRequestSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $exists: true, $ne: null } },
    name: 'code_unique',
  },
);

export const WithdrawalRequest: Model<IWithdrawalRequest> =
  (mongoose.models.WithdrawalRequest as Model<IWithdrawalRequest>) ||
  mongoose.model<IWithdrawalRequest>('WithdrawalRequest', withdrawalRequestSchema);

export default WithdrawalRequest;


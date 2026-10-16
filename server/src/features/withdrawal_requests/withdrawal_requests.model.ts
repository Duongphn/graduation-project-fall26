import { Schema, model, type InferSchemaType } from 'mongoose';

import { withdrawalStatuses } from '../../shared/domain/statuses.js';

// Simulated payout of test money (LI-02). Creating a request moves the amount from
// `available` to `held`; rejecting it moves it back; completing it removes it from `held`.
// Only the last four digits of the account number are stored.
const withdrawalRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: '{PATH} must be a whole number of VND.' },
    },
    bankInfo: {
      bankName: { type: String, required: true, trim: true },
      accountHolderName: { type: String, required: true, trim: true },
      accountNumberLast4: { type: String, required: true, match: /^\d{4}$/ },
    },
    status: { type: String, enum: withdrawalStatuses, required: true, default: 'PENDING' },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt: { type: Date },
    rejectReason: { type: String, trim: true, maxlength: 500 },
    payoutReference: { type: String, trim: true },
  },
  { collection: 'withdrawal_requests', timestamps: true },
);

withdrawalRequestSchema.pre('validate', function requireRejectReason() {
  if (this.status === 'REJECTED' && !this.rejectReason) {
    this.invalidate('rejectReason', 'A rejected withdrawal needs a reason.');
  }
});

withdrawalRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' }, name: 'one_pending_per_user' },
);
withdrawalRequestSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_requests' });
withdrawalRequestSchema.index({ status: 1, createdAt: 1 }, { name: 'admin_queue' });

export type WithdrawalRequest = InferSchemaType<typeof withdrawalRequestSchema>;
export const WithdrawalRequestModel = model('WithdrawalRequest', withdrawalRequestSchema);

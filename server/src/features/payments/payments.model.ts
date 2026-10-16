import { Schema, model, type InferSchemaType } from 'mongoose';

import { paymentGateways } from '../../shared/domain/enums.js';
import { paymentStatuses } from '../../shared/domain/statuses.js';

// A wallet top-up through VNPay or MoMo in test mode (LI-02). Orders are paid from the
// wallet, so a payment never points to an order. Payments are never deleted (no TTL):
// a job marks PENDING payments EXPIRED after `expiresAt`.
const paymentSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: '{PATH} must be a whole number of VND.' },
    },
    gateway: { type: String, enum: paymentGateways, required: true },
    gatewayTransactionNo: { type: String },
    gatewayResponseCode: { type: String },
    status: { type: String, enum: paymentStatuses, required: true, default: 'PENDING' },
    paidAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'payments', timestamps: true },
);

paymentSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
// GB-16: a gateway transaction is processed only once.
paymentSchema.index(
  { gateway: 1, gatewayTransactionNo: 1 },
  {
    unique: true,
    partialFilterExpression: { gatewayTransactionNo: { $type: 'string' } },
    name: 'gateway_transaction_unique',
  },
);
paymentSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_payments' });
paymentSchema.index(
  { expiresAt: 1 },
  { partialFilterExpression: { status: 'PENDING' }, name: 'pending_expiry' },
);

export type Payment = InferSchemaType<typeof paymentSchema>;
export const PaymentModel = model('Payment', paymentSchema);

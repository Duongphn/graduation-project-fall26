import mongoose, { Schema } from 'mongoose';

const paymentSchema = new Schema({
    code: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderType: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true },
    gateway: { type: String, required: true },
    gatewayTransactionNo: { type: String },
    status: { type: String, required: true, default: 'pending' },
    expiresAt: { type: Date }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
paymentSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
paymentSchema.index(
    { gateway: 1, gatewayTransactionNo: 1 },
    { unique: true, partialFilterExpression: { gatewayTransactionNo: { $exists: true, $ne: null } }, name: 'gateway_transaction_unique' }
);
paymentSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_payments' });
paymentSchema.index({ expiresAt: 1 }, { partialFilterExpression: { status: 'pending' }, name: 'pending_expiry' });

export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

export default Payment;

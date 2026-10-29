import mongoose, { Schema } from 'mongoose';

const withdrawalRequestSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    bankInfo: {
        bankName: { type: String, required: true },
        accountNumber: { type: String, required: true },
        accountHolderName: { type: String, required: true }
    },
    status: { type: String, required: true, default: 'pending' },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
withdrawalRequestSchema.index(
    { userId: 1 },
    { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_user' }
);
withdrawalRequestSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_requests' });
withdrawalRequestSchema.index({ status: 1, createdAt: -1 }, { name: 'admin_queue' });

export const WithdrawalRequest = mongoose.models.WithdrawalRequest || mongoose.model('WithdrawalRequest', withdrawalRequestSchema);

export default WithdrawalRequest;

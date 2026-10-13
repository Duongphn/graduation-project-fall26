const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    ownerType: { type: String, required: true }, // Ví dụ: 'user', 'platform'
    balance: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: 'VND' },
    status: { type: String, required: true, default: 'active' }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
walletSchema.index(
    { userId: 1 },
    { unique: true, partialFilterExpression: { userId: { $exists: true, $ne: null } }, name: 'one_wallet_per_user' }
);

walletSchema.index(
    { ownerType: 1 },
    { unique: true, partialFilterExpression: { ownerType: 'platform' }, name: 'one_platform_wallet' }
);

module.exports = mongoose.model('Wallet', walletSchema);
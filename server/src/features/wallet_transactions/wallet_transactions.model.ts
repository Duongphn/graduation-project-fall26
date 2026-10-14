const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletTransactionSchema = new Schema({
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    entryKey: { type: String, required: true, unique: true },
    postingKey: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, required: true }, // credit, debit
    reference: {
        kind: { type: String },
        id: { type: Schema.Types.ObjectId }
    },
    description: { type: String }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
walletTransactionSchema.index({ entryKey: 1 }, { unique: true, name: 'entry_key_unique' });
walletTransactionSchema.index({ postingKey: 1 }, { name: 'posting' });
walletTransactionSchema.index({ walletId: 1, createdAt: -1 }, { name: 'wallet_statement' });
walletTransactionSchema.index(
    { "reference.kind": 1, "reference.id": 1 },
    { partialFilterExpression: { "reference.kind": { $exists: true, $ne: null } }, name: 'by_reference' }
);

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
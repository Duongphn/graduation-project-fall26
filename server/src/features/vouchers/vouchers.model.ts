const mongoose = require('mongoose');
const { Schema } = mongoose;

const voucherSchema = new Schema({
    code: { type: String, required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    discountType: { type: String, required: true }, // percentage, fixed
    discountValue: { type: Number, required: true },
    minOrderValue: { type: Number, default: 0 },
    maxDiscount: { type: Number },
    quantity: { type: Number, required: true },
    usedCount: { type: Number, default: 0 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    status: { type: String, required: true, default: 'active' }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
voucherSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
voucherSchema.index({ ownerId: 1, status: 1, validTo: -1 }, { name: 'owner_vouchers' });
voucherSchema.index({ validTo: 1 }, { partialFilterExpression: { validTo: { $exists: true } }, name: 'expiry' });

module.exports = mongoose.model('Voucher', voucherSchema);
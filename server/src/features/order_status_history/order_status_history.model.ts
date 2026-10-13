const mongoose = require('mongoose');
const { Schema } = mongoose;

const orderStatusHistorySchema = new Schema({
    orderType: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, required: true },
    oldStatus: { type: String },
    newStatus: { type: String, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    notes: { type: String },
    occurredAt: { type: Date, default: Date.now }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo Index đồng bộ tuyệt đối với Atlas
orderStatusHistorySchema.index({ orderType: 1, orderId: 1, occurredAt: 1 }, { name: 'order_timeline' });

module.exports = mongoose.model('OrderStatusHistory', orderStatusHistorySchema);
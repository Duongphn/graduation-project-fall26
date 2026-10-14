const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, required: true },
    isRead: { type: Boolean, required: true, default: false }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
notificationSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_feed' });
notificationSchema.index({ userId: 1 }, { partialFilterExpression: { isRead: false }, name: 'unread_count' });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000, name: 'retention_ttl' }); // Ví dụ giữ thông báo trong 30 ngày

module.exports = mongoose.model('Notification', notificationSchema);
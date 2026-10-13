const mongoose = require('mongoose');
const { Schema } = mongoose;

const otpRequestSchema = new Schema({
    phone: { type: String, required: true },
    identifier: { type: String, required: true },
    otp_code: { type: String, required: true },
    purpose: { type: String, required: true },
    is_used: { type: Boolean, required: true, default: false },
    expires_at: { type: Date, required: true },
    purgeAt: { type: Date } // Dùng cho TTL index tự động xóa
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
otpRequestSchema.index({ phone: 1, purpose: 1, createdAt: -1 }, { name: 'phone_purpose_recent' });
otpRequestSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: 'purge_ttl' });

module.exports = mongoose.model('OtpRequest', otpRequestSchema);
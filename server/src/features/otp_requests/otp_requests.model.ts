import mongoose, { Schema } from 'mongoose';

const otpRequestSchema = new Schema({
    phone: { type: String },
    identifier: { type: String, required: true },
    otp_code: { type: String, required: true },
    purpose: { type: String, required: true },
    is_used: { type: Boolean, required: true, default: false },
    expires_at: { type: Date, required: true },
    purgeAt: { type: Date }, // Dùng cho TTL index tự động xóa
    // Dữ liệu chờ xác minh đi kèm OTP, vd: thông tin đăng ký (họ tên, SĐT, passwordHash) chỉ tạo User sau khi nhập đúng mã
    payload: { type: Schema.Types.Mixed }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ tuyệt đối với Atlas
otpRequestSchema.index({ identifier: 1, purpose: 1, createdAt: -1 }, { name: 'identifier_purpose_recent' });
otpRequestSchema.index(
    { phone: 1, purpose: 1, createdAt: -1 },
    { partialFilterExpression: { phone: { $exists: true, $ne: null } }, name: 'phone_purpose_recent' }
);
otpRequestSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: 'purge_ttl' });

export const OtpRequest = (mongoose.models.OtpRequest as mongoose.Model<any>) || mongoose.model('OtpRequest', otpRequestSchema);
export default OtpRequest;
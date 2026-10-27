import mongoose, { Schema } from 'mongoose';

export interface IOtpRequest {
  phone?: string;
  identifier: string;
  otp_code: string;
  purpose: string;
  is_used: boolean;
  expires_at: Date;
  purgeAt?: Date;
  payload?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const otpRequestSchema = new Schema<IOtpRequest>(
  {
    phone: { type: String },
    identifier: { type: String, required: true },
    otp_code: { type: String, required: true },
    purpose: { type: String, required: true },
    is_used: { type: Boolean, required: true, default: false },
    expires_at: { type: Date, required: true },
    purgeAt: { type: Date }, // Dùng cho TTL index tự động xóa
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
otpRequestSchema.index(
  { identifier: 1, purpose: 1, createdAt: -1 },
  { name: 'identifier_purpose_recent' },
);
otpRequestSchema.index(
  { phone: 1, purpose: 1, createdAt: -1 },
  { partialFilterExpression: { phone: { $exists: true } }, name: 'phone_purpose_recent' },
);
otpRequestSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0, name: 'purge_ttl' });

export const OtpRequest: mongoose.Model<IOtpRequest> =
  (mongoose.models.OtpRequest as mongoose.Model<IOtpRequest>) ||
  mongoose.model<IOtpRequest>('OtpRequest', otpRequestSchema);
export default OtpRequest;

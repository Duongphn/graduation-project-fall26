import { Schema, model, type InferSchemaType } from 'mongoose';

import { otpPurposes } from '../../shared/domain/enums.js';

export const OTP_MAX_ATTEMPTS = 5;

// SMS OTP only (FE-01). Kept one day after expiry so the 5-per-hour send limit can be counted.
const otpRequestSchema = new Schema(
  {
    phone: { type: String, required: true, trim: true },
    purpose: { type: String, enum: otpPurposes, required: true },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, required: true, default: 0, min: 0, max: OTP_MAX_ATTEMPTS },
    consumedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'otp_requests', timestamps: { createdAt: true, updatedAt: false } },
);

otpRequestSchema.index({ phone: 1, purpose: 1, createdAt: -1 }, { name: 'phone_purpose_recent' });
otpRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400, name: 'purge_ttl' });

export type OtpRequest = InferSchemaType<typeof otpRequestSchema>;
export const OtpRequestModel = model('OtpRequest', otpRequestSchema);

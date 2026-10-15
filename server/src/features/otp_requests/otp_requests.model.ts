import { Schema, model, type InferSchemaType } from 'mongoose';

import { otpPurposes } from '../../shared/domain/enums.js';

export const OTP_MAX_ATTEMPTS = 5;

// One-time codes (FE-01 SMS OTP, email OTP and one-time Google login codes), stored hashed.
// `identifier` is the destination (phone or email); `phone` is set for SMS codes. Kept one day
// after expiry so the send limits can be counted.
const otpRequestSchema = new Schema(
  {
    identifier: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    purpose: { type: String, enum: otpPurposes, required: true },
    codeHash: { type: String, required: true, select: false },
    attempts: { type: Number, required: true, default: 0, min: 0, max: OTP_MAX_ATTEMPTS },
    // Data waiting for the code, e.g. a pending sign-up (fullName, phone, passwordHash): the user
    // is created only after the code is verified.
    payload: { type: Schema.Types.Mixed, select: false },
    consumedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'otp_requests', timestamps: { createdAt: true, updatedAt: false } },
);

otpRequestSchema.index(
  { identifier: 1, purpose: 1, createdAt: -1 },
  { name: 'identifier_purpose_recent' },
);
otpRequestSchema.index(
  { phone: 1, purpose: 1, createdAt: -1 },
  { partialFilterExpression: { phone: { $exists: true } }, name: 'phone_purpose_recent' },
);
otpRequestSchema.index({ codeHash: 1, purpose: 1 }, { name: 'code_lookup' });
otpRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400, name: 'purge_ttl' });

export type OtpRequest = InferSchemaType<typeof otpRequestSchema>;
export const OtpRequestModel = model('OtpRequest', otpRequestSchema);

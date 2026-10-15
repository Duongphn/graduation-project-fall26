import { Schema, model, type InferSchemaType } from 'mongoose';

import { identityStatuses, userRoles, userStatuses } from '../../shared/domain/statuses.js';

const userSchema = new Schema(
  {
    phone: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    avatarUrl: { type: String },
    // Google account subject (`sub`), set on the first Google login.
    googleId: { type: String },
    // GB-07: minimum age (setting USER_MIN_AGE_YEARS). Optional for earlier accounts.
    dateOfBirth: { type: Date },
    role: { type: String, enum: userRoles, required: true, default: 'USER' },
    status: { type: String, enum: userStatuses, required: true, default: 'ACTIVE' },
    // Copy of the latest identity_verifications result, written in the same transaction.
    identityStatus: {
      type: String,
      enum: identityStatuses,
      required: true,
      default: 'UNVERIFIED',
    },
    // FE-09: the score is ratingSum / ratingCount.
    trust: {
      ratingCount: { type: Number, required: true, default: 0, min: 0 },
      ratingSum: { type: Number, required: true, default: 0, min: 0 },
      bookingBlocked: { type: Boolean, required: true, default: false },
      reviewRequestedAt: { type: Date },
    },
    lock: {
      until: { type: Date },
      reason: { type: String, trim: true, maxlength: 500 },
    },
  },
  { collection: 'users', timestamps: true },
);

userSchema.index({ phone: 1 }, { unique: true, name: 'phone_unique' });
userSchema.index({ email: 1 }, { unique: true, name: 'email_unique' });
userSchema.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: { googleId: { $exists: true } },
    name: 'google_id_unique',
  },
);
userSchema.index({ role: 1, status: 1, createdAt: -1 }, { name: 'admin_user_list' });
userSchema.index(
  { 'trust.reviewRequestedAt': 1 },
  {
    partialFilterExpression: { 'trust.reviewRequestedAt': { $exists: true } },
    name: 'trust_review_queue',
  },
);
userSchema.index(
  { 'lock.until': 1 },
  { partialFilterExpression: { 'lock.until': { $exists: true } }, name: 'lock_expiry' },
);

export type User = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);

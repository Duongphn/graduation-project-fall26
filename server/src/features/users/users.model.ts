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
import mongoose, { type Model, Schema } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

const addressSchema = new Schema(
  {
    province: { type: String, required: true },
    district: { type: String, required: true },
    ward: { type: String, required: true },
    street: { type: String, required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    phone: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true },
    avatar: { type: String },
    googleId: { type: String },
    role: { type: String, required: true, default: 'USER', enum: ['USER', 'ADMIN'] },
    status: { type: String, required: true, default: 'ACTIVE', enum: ['ACTIVE', 'LOCKED'] },
    verificationStatus: {
      type: String,
      required: true,
      default: 'unverified',
      enum: ['unverified', 'pending', 'verified', 'rejected'],
    },
    address: { type: addressSchema },
    idCardNumber: { type: String },
    trust: {
      score: { type: Number, min: 0, max: 100 },
      review: {
        requestedAt: { type: Date },
      },
      review: {
        requestedAt: { type: Date },
      },
        score: { type: Number, min: 0, max: 100 },
        review: {
            requestedAt: { type: Date }
        }
    },
    lock: {
      until: { type: Date },
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
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
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true, $ne: null } }, name: 'email_unique' },
  {
    unique: true,
    partialFilterExpression: { email: { $exists: true, $ne: null } },
    name: 'email_unique',
  },
);
userSchema.index({ role: 1, status: 1, createdAt: -1 }, { name: 'admin_user_list' });
userSchema.index(
  { 'trust.review.requestedAt': 1 },
  {
    partialFilterExpression: { 'trust.review.requestedAt': { $exists: true } },
    name: 'trust_review_queue',
  },
);
userSchema.index(
  { 'lock.until': 1 },
  { partialFilterExpression: { 'lock.until': { $exists: true } }, name: 'lock_expiry' },
);

export interface IUser {
  phone: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: string;
  status: string;
  trust?: {
    review?: {
      requestedAt?: Date;
    };
  };
  lock?: {
    until?: Date;
  };
}

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', userSchema);

export default User;
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $exists: true, $ne: null } }, name: 'email_unique' }
);
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $exists: true, $ne: null } }, name: 'google_id_unique' },
);
userSchema.index({ role: 1, status: 1, createdAt: -1 }, { name: 'admin_user_list' });
userSchema.index(
  { 'trust.review.requestedAt': 1 },
  { partialFilterExpression: { 'trust.review.requestedAt': { $exists: true } }, name: 'trust_review_queue' },
);
userSchema.index(
  { 'lock.until': 1 },
  { partialFilterExpression: { 'lock.until': { $exists: true } }, name: 'lock_expiry' },
);
userSchema.index(
  { idCardNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { idCardNumber: { $exists: true, $ne: null } },
    name: 'user_verified_idcard_unique',
  },
);

export interface IUser {
  _id: mongoose.Types.ObjectId;
  phone: string;
  email: string;
  passwordHash: string;
  fullName: string;
  avatar?: string;
  googleId?: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  address?: {
    province: string;
    district: string;
    ward: string;
    street: string;
  };
  idCardNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const User: mongoose.Model<IUser> =
  (mongoose.models.User as mongoose.Model<IUser>) || mongoose.model<IUser>('User', userSchema);
export default User;
export const User = (mongoose.models.User as mongoose.Model<any>) || mongoose.model('User', userSchema);
export default User;

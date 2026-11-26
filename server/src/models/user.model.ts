import mongoose, { type Model, Schema } from 'mongoose';

import { trustDecisionActions, type TrustDecisionAction } from '../constants/trust-review.js';

const addressSchema = new Schema(
  {
    province: { type: String, required: true },
    // Optional: Vietnam has no district level since 01/07/2025 (R03 III.6.1.1 (10)).
    district: { type: String },
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
    // R03 III.6.1.1 (5)–(7): chỉ hiển thị trên hồ sơ; ngày sinh không dùng cho GB-07
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['female', 'male', 'other'] },
    bio: { type: String, maxlength: 200 },
    googleId: { type: String },
    role: { type: String, required: true, default: 'USER', enum: ['USER', 'ADMIN'] },
    status: { type: String, required: true, default: 'ACTIVE', enum: ['ACTIVE', 'LOCKED'] },
    verificationStatus: {
      type: String,
      required: true,
      default: 'unverified',
      enum: ['unverified', 'pending', 'verified', 'rejected'],
    },
    // Địa chỉ cũ (một địa chỉ); nay dùng sổ địa chỉ `addresses`, AddressService chuyển nó sang khi đọc lần đầu
    address: { type: addressSchema },
    idCardNumber: { type: String },
    trust: {
      score: { type: Number, min: 0, max: 100 },
      // Open Admin review of a Renter refused by GB-29 (UC29, FE-09): one per user, updated by
      // every later refused attempt and removed when the Admin decides.
      review: {
        // First refused attempt of this review (the queue order).
        requestedAt: { type: Date },
        lastBlockedAt: { type: Date },
        attemptCount: { type: Number },
        // The latest toy the Renter tried to book, with the values the check used then.
        toyId: { type: Schema.Types.ObjectId, ref: 'Toy' },
        depositPrice: { type: Number },
        score: { type: Number },
        threshold: { type: Number },
        depositLimit: { type: Number },
      },
      // Block lifted by an Admin: high-deposit bookings are allowed while the score stays at or
      // above `score` (the score when the Admin lifted it).
      lift: {
        liftedAt: { type: Date },
        liftedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reason: { type: String },
        score: { type: Number },
      },
      // Last Admin decision on a review. After "keep", a refused attempt opens a new review
      // only once the score has changed.
      decision: {
        action: { type: String, enum: trustDecisionActions },
        reason: { type: String },
        decidedAt: { type: Date },
        decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        score: { type: Number },
      },
    },
    lock: {
      until: { type: Date },
      // Set when an Admin locks the account (UC29): shown at sign-in (MSG12); the listings the
      // lock hid are shown again at unlock.
      reason: { type: String },
      lockedAt: { type: Date },
      lockedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      hiddenToyIds: { type: [Schema.Types.ObjectId], default: undefined },
    },
    // Consecutive failed password sign-ins (GB-03); reset by a successful sign-in or a lock.
    failedLogins: {
      count: { type: Number, default: 0 },
      lastAt: { type: Date },
    },
    // Last successful sign-in, shown to the Admin (R03 III.7.2.1 (5)). Kept on the user, as the
    // sessions are deleted at sign-out and when the account is locked.
    lastLoginAt: { type: Date },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
userSchema.index({ phone: 1 }, { unique: true, name: 'phone_unique' });
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $exists: true } },
    name: 'email_unique',
  },
);
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
userSchema.index(
  { idCardNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { idCardNumber: { $exists: true } },
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
  dateOfBirth?: Date | undefined;
  gender?: 'female' | 'male' | 'other' | undefined;
  bio?: string | undefined;
  googleId?: string;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'LOCKED';
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  address?: {
    province: string;
    district?: string;
    ward: string;
    street: string;
  };
  idCardNumber?: string;
  trust?: {
    score?: number;
    review?: {
      requestedAt?: Date;
      lastBlockedAt?: Date;
      attemptCount?: number;
      toyId?: mongoose.Types.ObjectId;
      depositPrice?: number;
      score?: number;
      threshold?: number;
      depositLimit?: number;
    };
    lift?: {
      liftedAt?: Date;
      liftedBy?: mongoose.Types.ObjectId;
      reason?: string;
      score?: number;
    };
    decision?: {
      action?: TrustDecisionAction;
      reason?: string;
      decidedAt?: Date;
      decidedBy?: mongoose.Types.ObjectId;
      score?: number;
    };
  };
  lock?: {
    until?: Date;
    reason?: string;
    lockedAt?: Date;
    lockedBy?: mongoose.Types.ObjectId;
    hiddenToyIds?: mongoose.Types.ObjectId[];
  };
  failedLogins?: {
    count?: number;
    lastAt?: Date;
  };
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const User: Model<IUser> =
  (mongoose.models.User as Model<IUser>) || mongoose.model<IUser>('User', userSchema);

export default User;

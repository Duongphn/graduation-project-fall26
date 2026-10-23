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
    },
    lock: {
      until: { type: Date },
    },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
userSchema.index({ phone: 1 }, { unique: true, name: 'phone_unique' });
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $exists: true, $ne: null } },
    name: 'email_unique',
  },
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
  trust?: {
    score?: number;
    review?: {
      requestedAt?: Date;
    };
  };
  lock?: {
    until?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const User: mongoose.Model<IUser> =
  (mongoose.models.User as mongoose.Model<IUser>) || mongoose.model<IUser>('User', userSchema);
export default User;

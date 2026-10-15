import mongoose, { type Model, Schema } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

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
    trust: {
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
    { unique: true, partialFilterExpression: { googleId: { $exists: true, $ne: null } }, name: 'google_id_unique' }
);
userSchema.index({ role: 1, status: 1, createdAt: -1 }, { name: 'admin_user_list' });
userSchema.index(
    { "trust.review.requestedAt": 1 },
    { partialFilterExpression: { "trust.review.requestedAt": { $exists: true } }, name: 'trust_review_queue' }
);
userSchema.index(
    { "lock.until": 1 },
    { partialFilterExpression: { "lock.until": { $exists: true } }, name: 'lock_expiry' }
);

export const User = (mongoose.models.User as mongoose.Model<any>) || mongoose.model('User', userSchema);
export default User;

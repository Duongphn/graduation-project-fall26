import mongoose, { type Model, Schema } from 'mongoose';
import type { StoredIdentityImage } from './identity-verification.ports.js';

const storedIdentityImageSchema = new Schema(
  {
    publicId: { type: String, required: true },
    deliveryType: {
      type: String,
      required: true,
      default: 'authenticated',
      enum: ['authenticated'],
    },
  },
  { _id: false },
);

const identityVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    phone: { type: String, required: true },
    idCardNumber: { type: String, required: true },
    frontImage: { type: storedIdentityImageSchema, required: true },
    backImage: { type: storedIdentityImageSchema, required: true },
    selfie: { type: storedIdentityImageSchema, required: true },
    status: {
      type: String,
      required: true,
      default: 'pending',
      enum: ['pending', 'verified', 'rejected'],
    },
    rejectionReason: { type: String },
    submittedAt: { type: Date, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Indexes đồng bộ Atlas
identityVerificationSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_user' },
);
identityVerificationSchema.index({ userId: 1, submittedAt: -1 }, { name: 'user_history' });
identityVerificationSchema.index({ status: 1, submittedAt: 1 }, { name: 'admin_queue' });

export interface IIdentityVerification {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  phone: string;
  idCardNumber: string;
  frontImage: StoredIdentityImage;
  backImage: StoredIdentityImage;
  selfie: StoredIdentityImage;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason?: string;
  submittedAt: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const IdentityVerification: Model<IIdentityVerification> =
  (mongoose.models.IdentityVerification as Model<IIdentityVerification>) ||
  mongoose.model<IIdentityVerification>('IdentityVerification', identityVerificationSchema);

export default IdentityVerification;

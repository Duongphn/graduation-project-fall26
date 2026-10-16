import { Schema, model, type InferSchemaType } from 'mongoose';
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

import { privateImageSchema } from '../../infrastructure/database/schema-types.js';
import { verificationStatuses } from '../../shared/domain/statuses.js';

// One document per submission, so the documents of a user are the review history.
// The three photos are private Cloudinary assets ({ publicId, format }, "authenticated"
// delivery): only the Admin review builds 5-minute links to them (R04 III.1.3).
const identityVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    frontImage: { type: privateImageSchema, required: true },
    backImage: { type: privateImageSchema, required: true },
    selfieImage: { type: privateImageSchema, required: true },
    status: { type: String, enum: verificationStatuses, required: true, default: 'PENDING' },
    rejectReason: { type: String, trim: true, maxlength: 500 },
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
  { collection: 'identity_verifications', timestamps: true },
);

identityVerificationSchema.pre('validate', function requireRejectReason() {
  if (this.status === 'REJECTED' && !this.rejectReason) {
    this.invalidate('rejectReason', 'A rejected verification needs a reason.');
  }
});

// Indexes đồng bộ Atlas
identityVerificationSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' }, name: 'one_pending_per_user' },
);
identityVerificationSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_history' });
identityVerificationSchema.index({ status: 1, createdAt: 1 }, { name: 'admin_queue' });
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

export type IdentityVerification = InferSchemaType<typeof identityVerificationSchema>;
export const IdentityVerificationModel = model('IdentityVerification', identityVerificationSchema);

import mongoose, { Schema, model, type InferSchemaType, type Model } from 'mongoose';

import { verificationStatuses } from '../../shared/domain/statuses.js';
import type { StoredIdentityImage } from './identity-verification.ports.js';

// Merge of develop (Admin review: PENDING/VERIFIED/REJECTED, selfieImage, rejectReason, private
// images { publicId, format }) and UC03 (user submission: pending/verified/rejected, selfie,
// rejectionReason, phone, idCardNumber, images { publicId, deliveryType }). Both sets of fields
// are kept until the team picks one; each side validates its own required fields in its service.

// A private Cloudinary photo: develop stores { publicId, format }, UC03 { publicId, deliveryType }.
const identityImageSchema = new Schema(
  {
    publicId: { type: String, required: true, trim: true, maxlength: 300 },
    format: { type: String, trim: true, lowercase: true, maxlength: 5 },
    deliveryType: { type: String, enum: ['authenticated'] },
  },
  { _id: false },
);

// UC03 writes lowercase statuses, develop uppercase.
const uc03Statuses = ['pending', 'verified', 'rejected'] as const;

// One document per submission, so the documents of a user are the review history.
// The three photos are private Cloudinary assets ("authenticated" delivery): only the Admin
// review builds 5-minute links to them (R04 III.1.3).
const identityVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    frontImage: { type: identityImageSchema, required: true },
    backImage: { type: identityImageSchema, required: true },
    selfieImage: { type: identityImageSchema },
    selfie: { type: identityImageSchema },
    status: {
      type: String,
      enum: [...verificationStatuses, ...uc03Statuses],
      required: true,
      default: 'PENDING',
    },
    rejectReason: { type: String, trim: true, maxlength: 500 },
    rejectionReason: { type: String },
    phone: { type: String },
    idCardNumber: { type: String },
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
// UC03 lists by submittedAt.
identityVerificationSchema.index({ userId: 1, submittedAt: -1 }, { name: 'user_submissions' });

export type IdentityVerification = InferSchemaType<typeof identityVerificationSchema>;
export const IdentityVerificationModel = model('IdentityVerification', identityVerificationSchema);

/** UC03 view of a verification document (user submission service). */
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

// Same model, typed with the UC03 interface.
export const IdentityVerification = IdentityVerificationModel as unknown as Model<IIdentityVerification>;

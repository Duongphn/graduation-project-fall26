import { Schema, model, type InferSchemaType } from 'mongoose';

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

identityVerificationSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'PENDING' }, name: 'one_pending_per_user' },
);
identityVerificationSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_history' });
identityVerificationSchema.index({ status: 1, createdAt: 1 }, { name: 'admin_queue' });

export type IdentityVerification = InferSchemaType<typeof identityVerificationSchema>;
export const IdentityVerificationModel = model('IdentityVerification', identityVerificationSchema);

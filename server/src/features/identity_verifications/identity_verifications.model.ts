import mongoose, { type Model, Schema } from 'mongoose';

const identityVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    frontImageUrl: { type: String, required: true },
    backImageUrl: { type: String, required: true },
    selfieUrl: { type: String, required: true },
    status: { type: String, required: true, default: 'pending' },
    submittedAt: { type: Date, default: Date.now },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
identityVerificationSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' }, name: 'one_pending_per_user' },
);
identityVerificationSchema.index({ userId: 1, submittedAt: -1 }, { name: 'user_history' });
identityVerificationSchema.index({ status: 1, submittedAt: 1 }, { name: 'admin_queue' });

export interface IIdentityVerification {
  userId: mongoose.Types.ObjectId;
  frontImageUrl: string;
  backImageUrl: string;
  selfieUrl: string;
  status: string;
  submittedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
}

export const IdentityVerification: Model<IIdentityVerification> =
  (mongoose.models.IdentityVerification as Model<IIdentityVerification>) ||
  mongoose.model<IIdentityVerification>('IdentityVerification', identityVerificationSchema);

export default IdentityVerification;

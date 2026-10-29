import mongoose, { Schema } from 'mongoose';

export interface IRefreshToken {
  userId: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Index duy nhất cho token và TTL index tự xóa khi hết hạn
refreshTokenSchema.index({ token: 1 }, { unique: true, name: 'token_unique' });
refreshTokenSchema.index({ userId: 1 }, { name: 'by_user' });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'refresh_token_ttl' });

export const RefreshToken: mongoose.Model<IRefreshToken> =
  (mongoose.models.RefreshToken as mongoose.Model<IRefreshToken>) ||
  mongoose.model<IRefreshToken>('RefreshToken', refreshTokenSchema);
export default RefreshToken;

import { Schema, model, type InferSchemaType } from 'mongoose';

// One document per login session. Locking an account revokes all of its sessions.
const refreshTokenSchema = new Schema(
  {
export interface IRefreshToken {
  userId: mongoose.Types.ObjectId;
  token: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
  },
  { collection: 'refresh_tokens', timestamps: { createdAt: true, updatedAt: false } },
);

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true, name: 'token_hash_unique' });
refreshTokenSchema.index({ userId: 1 }, { name: 'user_sessions' });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiry_ttl' });

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
export const RefreshToken: mongoose.Model<IRefreshToken> =
  (mongoose.models.RefreshToken as mongoose.Model<IRefreshToken>) ||
  mongoose.model<IRefreshToken>('RefreshToken', refreshTokenSchema);
export default RefreshToken;

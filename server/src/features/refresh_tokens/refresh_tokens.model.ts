import mongoose, { Schema } from 'mongoose';

const refreshTokenSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Index duy nhất cho token và TTL index tự xóa khi hết hạn
refreshTokenSchema.index({ token: 1 }, { unique: true, name: 'token_unique' });
refreshTokenSchema.index({ userId: 1 }, { name: 'by_user' });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'refresh_token_ttl' });

export const RefreshToken = (mongoose.models.RefreshToken as mongoose.Model<any>) || mongoose.model('RefreshToken', refreshTokenSchema);
export default RefreshToken;
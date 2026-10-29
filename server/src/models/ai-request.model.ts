import mongoose, { Schema } from 'mongoose';

const aiRequestSchema = new Schema({
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    prompt: { type: String, required: true },
    response: { type: String, required: true },
    token_usage: { type: Number, required: true, default: 0 }
}, { timestamps: { createdAt: 'created_at', updatedAt: false } });

export const AiRequest = mongoose.models.AiRequest || mongoose.model('AiRequest', aiRequestSchema);

export default AiRequest;

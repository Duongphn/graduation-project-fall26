import mongoose, { Schema } from 'mongoose';

const messageSchema = new Schema({
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    isRead: { type: Boolean, required: true, default: false }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo Index đồng bộ tuyệt đối với Atlas
messageSchema.index({ conversationId: 1, createdAt: -1 }, { name: 'room_history' });

export const Message = mongoose.models.Message || mongoose.model('Message', messageSchema);

export default Message;

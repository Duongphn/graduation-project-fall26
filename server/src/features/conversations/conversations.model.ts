const mongoose = require('mongoose');
const { Schema } = mongoose;

const conversationSchema = new Schema({
    participants: [{
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }
    }],
    context: {
        kind: { type: String }, // Ví dụ: 'rental_order', 'purchase_order'
        id: { type: Schema.Types.ObjectId }
    },
    lastMessageAt: { type: Date }
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });

// Tạo các Index đồng bộ với Atlas
conversationSchema.index({ "context.kind": 1, "context.id": 1 }, { unique: true, sparse: true, name: 'one_per_order' });
conversationSchema.index({ "participants.userId": 1, lastMessageAt: -1 }, { name: 'inbox' });

module.exports = mongoose.model('Conversation', conversationSchema);
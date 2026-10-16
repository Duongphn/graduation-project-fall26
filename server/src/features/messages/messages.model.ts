import { Schema, model, type InferSchemaType } from 'mongoose';

// Read state is kept per participant on the conversation (`participants[].lastReadAt`).
const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, trim: true, maxlength: 2000 },
    images: {
      type: [String],
      validate: { validator: (value: string[]) => value.length <= 5, message: 'At most 5 images.' },
    },
    // GB-11: phone numbers or payment details were hidden and a warning was shown.
    masked: { type: Boolean, required: true, default: false },
  },
  { collection: 'messages', timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.pre('validate', function requireBody() {
  if (!this.content && this.images.length === 0) {
    this.invalidate('content', 'A message needs text or an image.');
  }
});

messageSchema.index({ conversationId: 1, createdAt: -1 }, { name: 'room_history' });

export type Message = InferSchemaType<typeof messageSchema>;
export const MessageModel = model('Message', messageSchema);

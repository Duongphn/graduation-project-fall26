import { Schema, model, type InferSchemaType } from 'mongoose';

import { referenceSchema } from '../../infrastructure/database/schema-types.js';
import { aiRequestKinds } from '../../shared/domain/enums.js';

// One call to the AI service: the toy advisor (FE-04) or the damage check (FE-07).
// The result is advisory only (LI-03); it never changes a toy, an order or a dispute.
const aiRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: aiRequestKinds, required: true },
    prompt: { type: String, required: true },
    response: { type: String, required: true },
    suggestedToyIds: [{ type: Schema.Types.ObjectId, ref: 'Toy' }],
    // The order a damage check belongs to.
    reference: { type: referenceSchema },
    aiModel: { type: String },
    tokenUsage: { type: Number, required: true, default: 0, min: 0 },
  },
  { collection: 'ai_requests', timestamps: { createdAt: true, updatedAt: false } },
);

aiRequestSchema.index({ userId: 1, createdAt: -1 }, { name: 'user_requests' });
aiRequestSchema.index(
  { 'reference.kind': 1, 'reference.id': 1 },
  { partialFilterExpression: { 'reference.kind': { $type: 'string' } }, name: 'by_reference' },
);

export type AiRequest = InferSchemaType<typeof aiRequestSchema>;
export const AiRequestModel = model('AiRequest', aiRequestSchema);

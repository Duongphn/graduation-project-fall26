import { Schema, model, type InferSchemaType } from 'mongoose';

import { appendOnlyPlugin } from '../../infrastructure/database/schema-types.js';
import { actorTypes } from '../../shared/contracts/actor.js';
import { orderTypes } from '../../shared/contracts/order-status-change.js';

// GB-19: every status change of a rental, purchase or donation, written in the same
// transaction as the change. Append-only.
const orderStatusHistorySchema = new Schema(
  {
    orderType: { type: String, enum: orderTypes, required: true },
    orderId: { type: Schema.Types.ObjectId, required: true },
    fromStatus: { type: String },
    toStatus: { type: String, required: true },
    actor: {
      type: { type: String, enum: actorTypes, required: true },
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    reason: { type: String, trim: true, maxlength: 1000 },
  },
  { collection: 'order_status_history', timestamps: { createdAt: true, updatedAt: false } },
);

orderStatusHistorySchema.plugin(appendOnlyPlugin);
orderStatusHistorySchema.index(
  { orderType: 1, orderId: 1, createdAt: 1 },
  { name: 'order_timeline' },
);

export type OrderStatusHistory = InferSchemaType<typeof orderStatusHistorySchema>;
export const OrderStatusHistoryModel = model('OrderStatusHistory', orderStatusHistorySchema);

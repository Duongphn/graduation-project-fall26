import { Schema, model } from 'mongoose';

import { actorTypes } from '../../shared/contracts/actor.js';
import { orderTypes } from '../../shared/contracts/order-status-change.js';

const orderStatusHistorySchema = new Schema(
  {
    orderType: { type: String, enum: orderTypes, required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, required: true },
    actorType: { type: String, enum: actorTypes, required: true },
    actorId: { type: Schema.Types.ObjectId, required: false },
    reason: { type: String, required: false, trim: true },
    note: { type: String, required: false, trim: true },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  {
    collection: 'order_status_history',
    timestamps: true,
  },
);

orderStatusHistorySchema.index({ orderType: 1, orderId: 1, occurredAt: 1 });

export const OrderStatusHistoryModel = model('OrderStatusHistory', orderStatusHistorySchema);

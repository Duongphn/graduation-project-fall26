import { Schema, model, type InferSchemaType } from 'mongoose';

import {
  cancellationSchema,
  handoverSchema,
  money,
  timerSchema,
} from '../../infrastructure/database/schema-types.js';
import { activeResaleStatuses, resaleOrderStatuses } from '../../shared/domain/statuses.js';

// A purchase order is created when the Buyer pays from the wallet (BF-03 step 2).
// Users arrange delivery themselves (LI-05): no address, delivery fee or tracking code.
const purchaseOrderSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    buyerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy', required: true },
    toyTitle: { type: String, required: true, trim: true },
    // Snapshot taken at payment (GB-38). The Buyer pays the price; the Seller receives
    // price - platformFee when the order is completed.
    pricing: {
      price: money(),
      platformFee: { ...money(), default: 0 },
    },
    status: { type: String, enum: resaleOrderStatuses, required: true, default: 'PAID' },
    timer: { type: timerSchema, default: undefined },
    handovers: { type: [handoverSchema], default: [] },
    handoverNote: { type: String, trim: true, maxlength: 1000 },
    completedAt: { type: Date },
    cancellation: { type: cancellationSchema, default: undefined },
  },
  { collection: 'purchase_orders', timestamps: true },
);

purchaseOrderSchema.pre('validate', function checkOrder() {
  if (this.buyerId && this.sellerId && this.buyerId.equals(this.sellerId)) {
    this.invalidate('buyerId', 'A seller cannot buy their own toy (GB-13).');
  }
  const pricing = this.pricing;
  if (pricing && pricing.platformFee > pricing.price) {
    this.invalidate('pricing.platformFee', 'The platform fee cannot exceed the price.');
  }
});

purchaseOrderSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
purchaseOrderSchema.index({ buyerId: 1, status: 1, createdAt: -1 }, { name: 'buyer_orders' });
purchaseOrderSchema.index({ sellerId: 1, status: 1, createdAt: -1 }, { name: 'seller_orders' });
// Sell once: at most one order in an active status per toy.
purchaseOrderSchema.index(
  { toyId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [...activeResaleStatuses] } },
    name: 'one_active_order_per_toy',
  },
);
// Orders of one toy by status (toy listing checks: unfinished orders, sold toys).
purchaseOrderSchema.index({ toyId: 1, status: 1 }, { name: 'toy_orders' });
purchaseOrderSchema.index(
  { 'timer.dueAt': 1 },
  { partialFilterExpression: { 'timer.dueAt': { $exists: true } }, name: 'timer_due' },
);

export type PurchaseOrder = InferSchemaType<typeof purchaseOrderSchema>;
export const PurchaseOrderModel = model('PurchaseOrder', purchaseOrderSchema);

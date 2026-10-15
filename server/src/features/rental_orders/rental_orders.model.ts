import { Schema, model, type InferSchemaType } from 'mongoose';

import {
  cancellationSchema,
  handoverSchema,
  money,
  optionalMoney,
  timerSchema,
} from '../../infrastructure/database/schema-types.js';
import { rentalOrderStatuses } from '../../shared/domain/statuses.js';

const rentalOrderSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    renterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toyId: { type: Schema.Types.ObjectId, ref: 'Toy', required: true },
    // Half-open range [startDate, endDate): a booking ending on day D does not block day D.
    period: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },
    // Snapshot taken when the request is sent (GB-38). The voucher lowers the rental fee only.
    pricing: {
      rentPerDay: money(),
      days: { type: Number, required: true, min: 1 },
      rentalFee: money(),
      discount: { ...money(), default: 0 },
      deposit: money(),
      platformFee: { ...money(), default: 0 },
      total: money(),
    },
    voucher: {
      voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher' },
      code: { type: String },
    },
    status: { type: String, enum: rentalOrderStatuses, required: true, default: 'REQUESTED' },
    timer: { type: timerSchema, default: undefined },
    handovers: { type: [handoverSchema], default: [] },
    // AI comparison of the handover photos. Advisory only (LI-03, GB-27).
    damageCheck: {
      aiRequestId: { type: Schema.Types.ObjectId, ref: 'AiRequest' },
      possibleDamage: { type: Boolean },
      summary: { type: String, maxlength: 2000 },
      checkedAt: { type: Date },
    },
    // Filled when the order is completed (BF-02 step 8 or BF-05).
    settlement: {
      lateFee: optionalMoney(),
      damageCost: optionalMoney(),
      toOwner: optionalMoney(),
      toRenter: optionalMoney(),
      settledAt: { type: Date },
    },
    cancellation: { type: cancellationSchema, default: undefined },
  },
  { collection: 'rental_orders', timestamps: true },
);

rentalOrderSchema.pre('validate', function checkOrder() {
  if (this.renterId && this.ownerId && this.renterId.equals(this.ownerId)) {
    this.invalidate('renterId', 'An owner cannot rent their own toy (GB-13).');
  }

  const { startDate, endDate } = this.period ?? {};
  if (startDate && endDate && endDate <= startDate) {
    this.invalidate('period.endDate', 'The end date must be after the start date.');
  }

  const pricing = this.pricing;
  if (pricing) {
    if (pricing.discount > pricing.rentalFee) {
      this.invalidate('pricing.discount', 'A voucher can lower the rental fee only.');
    }
    if (pricing.total !== pricing.rentalFee - pricing.discount + pricing.deposit) {
      this.invalidate('pricing.total', 'The total must be rental fee - discount + deposit.');
    }
  }

  // A late fee and a damage cost are taken from the deposit, so together they cannot exceed it.
  const lateFee = this.settlement?.lateFee ?? 0;
  const damageCost = this.settlement?.damageCost ?? 0;
  if (pricing && lateFee + damageCost > pricing.deposit) {
    this.invalidate('settlement', 'The late fee and damage cost cannot exceed the deposit.');
  }
});

rentalOrderSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
rentalOrderSchema.index({ renterId: 1, createdAt: -1 }, { name: 'renter_orders' });
rentalOrderSchema.index({ ownerId: 1, status: 1, createdAt: -1 }, { name: 'owner_orders' });
rentalOrderSchema.index(
  { toyId: 1, status: 1, 'period.startDate': 1, 'period.endDate': 1 },
  { name: 'toy_calendar' },
);
rentalOrderSchema.index(
  { 'timer.dueAt': 1 },
  { partialFilterExpression: { 'timer.dueAt': { $exists: true } }, name: 'timer_due' },
);

export type RentalOrder = InferSchemaType<typeof rentalOrderSchema>;
export const RentalOrderModel = model('RentalOrder', rentalOrderSchema);

import { Schema, model, type InferSchemaType } from 'mongoose';

import { money, optionalMoney } from '../../infrastructure/database/schema-types.js';
import { discountTypes } from '../../shared/domain/enums.js';
import { voucherStatuses } from '../../shared/domain/statuses.js';

// FE-06: an Owner's voucher lowers the rental fee only, never the deposit. A booking
// redeems it with `updateOne({ _id, status: 'ACTIVE', usedCount: { $lt: quantity } },
// { $inc: { usedCount: 1 } })` in the booking transaction and keeps a snapshot.
const voucherSchema = new Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    discountType: { type: String, enum: discountTypes, required: true },
    // PERCENT: 1-100. FIXED: whole VND.
    discountValue: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: '{PATH} must be a whole number.' },
    },
    minOrderValue: { ...money(), default: 0 },
    maxDiscount: optionalMoney(),
    quantity: { type: Number, required: true, min: 1 },
    usedCount: { type: Number, required: true, default: 0, min: 0 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    status: { type: String, enum: voucherStatuses, required: true, default: 'ACTIVE' },
  },
  { collection: 'vouchers', timestamps: true },
);

voucherSchema.pre('validate', function checkVoucher() {
  if (this.discountType === 'PERCENT' && this.discountValue > 100) {
    this.invalidate('discountValue', 'A percentage discount is at most 100.');
  }
  if (this.validFrom && this.validTo && this.validTo <= this.validFrom) {
    this.invalidate('validTo', 'The end date must be after the start date.');
  }
  if (this.usedCount > this.quantity) {
    this.invalidate('usedCount', 'A voucher cannot be used more often than its quantity.');
  }
});

voucherSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
voucherSchema.index({ ownerId: 1, status: 1, validTo: -1 }, { name: 'owner_vouchers' });
voucherSchema.index(
  { validTo: 1 },
  { partialFilterExpression: { status: 'ACTIVE' }, name: 'expiry' },
);

export type Voucher = InferSchemaType<typeof voucherSchema>;
export const VoucherModel = model('Voucher', voucherSchema);

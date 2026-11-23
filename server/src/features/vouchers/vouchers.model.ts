import mongoose, { type Model, Schema } from 'mongoose';

export interface IVoucher {
  code: string;
  ownerId: mongoose.Types.ObjectId;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderValue?: number;
  maxDiscount?: number;
  quantity: number;
  usedCount: number;
  validFrom: Date;
  validTo: Date;
  status: 'active' | 'used_up' | 'expired' | 'disabled';
  applicableToyIds?: mongoose.Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

const voucherSchema = new Schema<IVoucher>(
  {
    code: { type: String, required: true, unique: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    discountType: { type: String, required: true }, // percentage, fixed
    discountValue: { type: Number, required: true },
    minOrderValue: { type: Number, default: 0 },
    maxDiscount: { type: Number },
    quantity: { type: Number, required: true },
    usedCount: { type: Number, default: 0 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    status: { type: String, required: true, default: 'active' },
    applicableToyIds: [{ type: Schema.Types.ObjectId, ref: 'Toy' }],
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
voucherSchema.index({ code: 1 }, { unique: true, name: 'code_unique' });
voucherSchema.index({ ownerId: 1, status: 1, validTo: -1 }, { name: 'owner_vouchers' });
voucherSchema.index(
  { validTo: 1 },
  { partialFilterExpression: { validTo: { $exists: true } }, name: 'expiry' },
);

export const Voucher: Model<IVoucher> =
  (mongoose.models.Voucher as Model<IVoucher>) ||
  mongoose.model<IVoucher>('Voucher', voucherSchema);

export default Voucher;

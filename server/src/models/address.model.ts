import mongoose, { type Model, Schema } from 'mongoose';

/** R04 3.26 addresses: sổ địa chỉ giao nhận của người dùng (R03 III.6.1.1 (9)–(11)) */
const addressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientName: { type: String, required: true },
    phone: { type: String, required: true },
    province: { type: String, required: true },
    ward: { type: String, required: true },
    street: { type: String, required: true },
    isDefault: { type: Boolean, required: true, default: false },
    // Chỉ đi từ active sang hidden: xoá địa chỉ là ẩn nó, không xoá hẳn (R04 3.26)
    status: { type: String, required: true, default: 'active', enum: ['active', 'hidden'] },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

addressSchema.index({ userId: 1, status: 1, createdAt: 1 }, { name: 'user_addresses' });
// Mỗi người dùng có nhiều nhất một địa chỉ mặc định đang dùng
addressSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { isDefault: true, status: 'active' },
    name: 'user_default_address_unique',
  },
);

export interface IAddress {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  recipientName: string;
  phone: string;
  province: string;
  ward: string;
  street: string;
  isDefault: boolean;
  status: 'active' | 'hidden';
  createdAt: Date;
  updatedAt: Date;
}

export const Address: Model<IAddress> =
  (mongoose.models.Address as Model<IAddress>) || mongoose.model<IAddress>('Address', addressSchema);

export default Address;

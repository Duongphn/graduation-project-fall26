import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export type WalletOwnerType = 'user' | 'platform' | 'escrow' | 'platform_fee';
export type WalletStatus = 'active' | 'frozen' | 'closed';

export interface IWallet extends Document {
  _id: Types.ObjectId;
  userId?: Types.ObjectId | undefined;
  ownerType: WalletOwnerType;
  balance: number;
  currency: string;
  status: WalletStatus;
  createdAt: Date;
  updatedAt: Date;
}


const walletSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    ownerType: { type: String, required: true }, // 'user', 'escrow', 'platform_fee', 'platform'
    balance: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: 'VND' },
    status: { type: String, required: true, default: 'active' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
walletSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $exists: true, $ne: null } }, name: 'one_wallet_per_user' },
);

walletSchema.index(
  { ownerType: 1 },
  { unique: true, partialFilterExpression: { ownerType: 'platform' }, name: 'one_platform_wallet' },
);

walletSchema.index(
  { ownerType: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: { $in: ['escrow', 'platform_fee'] } },
    name: 'one_system_wallet_per_type',
  },
);

export const Wallet: Model<IWallet> =
  mongoose.models.Wallet || mongoose.model<IWallet>('Wallet', walletSchema);

export default Wallet;


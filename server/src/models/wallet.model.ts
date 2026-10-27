import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type WalletOwnerType = 'user' | 'platform' | 'escrow' | 'external';

export interface IWallet extends Document {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  ownerType: WalletOwnerType;
  balance: number;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    ownerType: {
      type: String,
      required: true,
      enum: ['user', 'platform', 'escrow', 'external'],
    },
    balance: { type: Number, required: true, default: 0 },
    currency: { type: String, required: true, default: 'VND' },
    status: { type: String, required: true, default: 'active' },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

walletSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $exists: true } },
    name: 'one_wallet_per_user',
  },
);

walletSchema.index(
  { ownerType: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: 'platform' },
    name: 'one_platform_wallet',
  },
);

walletSchema.index(
  { ownerType: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: 'escrow' },
    name: 'one_escrow_wallet',
  },
);

walletSchema.index(
  { ownerType: 1 },
  {
    unique: true,
    partialFilterExpression: { ownerType: 'external' },
    name: 'one_external_wallet',
  },
);

export const Wallet: Model<IWallet> =
  (mongoose.models.Wallet as Model<IWallet>) || mongoose.model<IWallet>('Wallet', walletSchema);

export default Wallet;

import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

export type WalletTransactionType = 'credit' | 'debit';

export interface IWalletTransactionReference {
  kind?: string | undefined;
  id?: Types.ObjectId | undefined;
}

export interface IWalletTransaction extends Document {
  _id: Types.ObjectId;
  walletId: Types.ObjectId;
  entryKey: string;
  postingKey: string;
  amount: number;
  type: WalletTransactionType;
  balanceBefore?: number | undefined;
  balanceAfter?: number | undefined;
  reference?: IWalletTransactionReference | undefined;
  description?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}


const walletTransactionSchema = new Schema(
  {
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    entryKey: { type: String, required: true, unique: true },
    postingKey: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, required: true }, // credit, debit
    balanceBefore: { type: Number },
    balanceAfter: { type: Number },
    reference: {
      kind: { type: String },
      id: { type: Schema.Types.ObjectId },
    },
    description: { type: String },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

// Tạo các Index đồng bộ tuyệt đối với Atlas
walletTransactionSchema.index({ entryKey: 1 }, { unique: true, name: 'entry_key_unique' });
walletTransactionSchema.index({ postingKey: 1 }, { name: 'posting' });
walletTransactionSchema.index({ walletId: 1, createdAt: -1 }, { name: 'wallet_statement' });
walletTransactionSchema.index(
  { 'reference.kind': 1, 'reference.id': 1 },
  { partialFilterExpression: { 'reference.kind': { $exists: true, $ne: null } }, name: 'by_reference' },
);

export const WalletTransaction: Model<IWalletTransaction> =
  mongoose.models.WalletTransaction ||
  mongoose.model<IWalletTransaction>('WalletTransaction', walletTransactionSchema);

export default WalletTransaction;


import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export interface IWalletTransaction extends Document {
  _id: Types.ObjectId;
  walletId: Types.ObjectId;
  entryKey: string;
  postingKey: string;
  amount: number;
  type: 'credit' | 'debit';
  reference?: {
    kind: 'rental_order' | 'admin_credit';
    id: Types.ObjectId;
  };
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const walletTransactionSchema = new Schema<IWalletTransaction>(
  {
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    entryKey: { type: String, required: true },
    postingKey: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, required: true, enum: ['credit', 'debit'] },
    reference: {
      kind: { type: String, enum: ['rental_order', 'admin_credit'] },
      id: { type: Schema.Types.ObjectId },
    },
    description: { type: String },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } },
);

walletTransactionSchema.index({ entryKey: 1 }, { unique: true, name: 'entry_key_unique' });
walletTransactionSchema.index({ postingKey: 1 }, { name: 'posting' });
walletTransactionSchema.index({ walletId: 1, createdAt: -1 }, { name: 'wallet_statement' });
walletTransactionSchema.index(
  { 'reference.kind': 1, 'reference.id': 1 },
  {
    partialFilterExpression: { 'reference.kind': { $exists: true } },
    name: 'by_reference',
  },
);

export const WalletTransaction: Model<IWalletTransaction> =
  (mongoose.models.WalletTransaction as Model<IWalletTransaction>) ||
  mongoose.model<IWalletTransaction>('WalletTransaction', walletTransactionSchema);

export default WalletTransaction;

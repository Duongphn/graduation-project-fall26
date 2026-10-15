import { Schema, model, type InferSchemaType } from 'mongoose';

import { appendOnlyPlugin, referenceSchema } from '../../infrastructure/database/schema-types.js';
import { ledgerBuckets, ledgerEntryTypes } from '../../shared/domain/enums.js';

// GB-31: one row per change of one bucket of one wallet. Rows are never edited or deleted;
// a correction is a new row. All rows of one business operation share a `postingKey`.
// `entryKey` is unique, so replaying an operation (e.g. a repeated gateway callback)
// cannot write the same entry twice.
const walletTransactionSchema = new Schema(
  {
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    entryKey: { type: String, required: true },
    postingKey: { type: String, required: true },
    type: { type: String, enum: ledgerEntryTypes, required: true },
    bucket: { type: String, enum: ledgerBuckets, required: true },
    // Signed whole VND: positive = credit, negative = debit.
    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (value: number) => Number.isInteger(value) && value !== 0,
        message: '{PATH} must be a non-zero whole number of VND.',
      },
    },
    availableAfter: { type: Number, required: true, min: 0 },
    heldAfter: { type: Number, required: true, min: 0 },
    reference: { type: referenceSchema },
    description: { type: String, trim: true, maxlength: 500 },
  },
  { collection: 'wallet_transactions', timestamps: { createdAt: true, updatedAt: false } },
);

walletTransactionSchema.plugin(appendOnlyPlugin);
walletTransactionSchema.index({ entryKey: 1 }, { unique: true, name: 'entry_key_unique' });
walletTransactionSchema.index({ postingKey: 1 }, { name: 'posting' });
walletTransactionSchema.index({ walletId: 1, createdAt: -1 }, { name: 'wallet_statement' });
walletTransactionSchema.index(
  { 'reference.kind': 1, 'reference.id': 1 },
  { partialFilterExpression: { 'reference.kind': { $type: 'string' } }, name: 'by_reference' },
);

export type WalletTransaction = InferSchemaType<typeof walletTransactionSchema>;
export const WalletTransactionModel = model('WalletTransaction', walletTransactionSchema);

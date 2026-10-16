import { Schema, model, type InferSchemaType } from 'mongoose';

import { money } from '../../infrastructure/database/schema-types.js';
import { walletOwnerTypes } from '../../shared/domain/enums.js';
import { walletStatuses } from '../../shared/domain/statuses.js';

// Test money only (LI-02), whole VND. `held` is the money frozen for orders in progress,
// open disputes and pending withdrawals (simulated escrow, FE-06). Balances change only
// through guarded `$inc` updates that write wallet_transactions in the same transaction.
const walletSchema = new Schema(
  {
    ownerType: { type: String, enum: walletOwnerTypes, required: true, default: 'USER' },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    available: { ...money(), default: 0 },
    held: { ...money(), default: 0 },
    status: { type: String, enum: walletStatuses, required: true, default: 'ACTIVE' },
  },
  { collection: 'wallets', timestamps: true },
);

walletSchema.pre('validate', function checkOwner() {
  if (this.ownerType === 'USER' && !this.userId) {
    this.invalidate('userId', 'A user wallet needs its owner.');
  }
  if (this.ownerType === 'PLATFORM' && this.userId) {
    this.invalidate('userId', 'The platform wallet has no user.');
  }
});

walletSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { ownerType: 'USER' }, name: 'one_wallet_per_user' },
);
walletSchema.index(
  { ownerType: 1 },
  { unique: true, partialFilterExpression: { ownerType: 'PLATFORM' }, name: 'one_platform_wallet' },
);

/**
 * Server-side validator applied by `syncDatabase()`. `$inc` updates bypass Mongoose
 * validation, so this is what keeps a balance from going below zero.
 */
export const walletCollectionValidator = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['ownerType', 'available', 'held'],
    properties: {
      available: { bsonType: ['int', 'long', 'double'], minimum: 0, multipleOf: 1 },
      held: { bsonType: ['int', 'long', 'double'], minimum: 0, multipleOf: 1 },
    },
  },
};

export type Wallet = InferSchemaType<typeof walletSchema>;
export const WalletModel = model('Wallet', walletSchema);

import type { ClientSession, Types } from 'mongoose';

import type { LedgerBucket, LedgerEntryType, ReferenceKind } from '../domain/enums.js';

/** One change of one bucket of one wallet. `amount` is signed whole VND. */
export interface LedgerEntry {
  walletId: Types.ObjectId;
  bucket: LedgerBucket;
  amount: number;
  type: LedgerEntryType;
  reference?: { kind: ReferenceKind; id: Types.ObjectId };
  description?: string;
}

/**
 * Port implemented by the wallets feature and injected by the app layer, so that features
 * that move money (payments, orders, disputes, withdrawals) do not import the wallets feature.
 * Every entry of a posting is applied in the caller's transaction or none is.
 */
export type PostLedger = (
  session: ClientSession,
  postingKey: string,
  entries: readonly LedgerEntry[],
) => Promise<void>;

export class InsufficientFundsError extends Error {
  constructor() {
    super('The wallet balance is too low.');
    this.name = 'InsufficientFundsError';
  }
}

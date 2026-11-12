import { type ClientSession } from 'mongoose';
import {
  type LedgerReferenceKind,
  type WalletTransactionDirection,
} from '../constants/wallet-transaction.js';
import { type IWallet, type IWalletTransaction } from '../models/index.js';

export type SystemWalletType = 'platform' | 'escrow' | 'external';

export interface WalletRecord {
  id: string;
  userId?: string | undefined;
  ownerType: IWallet['ownerType'];
  balance: number;
  currency: string;
}

export interface LedgerEntry {
  walletId: string;
  amount: number;
}

export interface LedgerReference {
  kind: LedgerReferenceKind;
  id: string;
}

/** Optional filters of a wallet statement. */
export interface TransactionFilter {
  kinds?: readonly LedgerReferenceKind[] | undefined;
  direction?: WalletTransactionDirection | undefined;
}

/** Money of a user that is not spendable yet but still theirs (VND). */
export interface WalletHoldings {
  /** Rent + deposit of their paid, unsettled rentals (held in escrow). */
  rentals: number;
}

export interface WalletHoldingsPort {
  getHoldings(userId: string): Promise<WalletHoldings>;
}

export interface WalletLedgerPort {
  getOrCreateUserWallet(userId: string, session?: ClientSession): Promise<WalletRecord>;
  getOrCreateSystemWallet(type: SystemWalletType, session?: ClientSession): Promise<WalletRecord>;
  post(
    postingKey: string,
    reference: LedgerReference,
    entries: LedgerEntry[],
    session: ClientSession,
    description?: string,
  ): Promise<void>;
  listTransactions(
    walletId: string,
    page: number,
    limit: number,
    filter?: TransactionFilter,
  ): Promise<{ items: IWalletTransaction[]; total: number }>;
}

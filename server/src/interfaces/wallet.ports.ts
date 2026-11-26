import { type ClientSession } from 'mongoose';
import { type LedgerReferenceKind } from '../constants/wallet-transaction.js';
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

/** Optional filters of a wallet statement (same as the lead's listByWalletId). */
export interface TransactionFilter {
  /** reference.kind, e.g. rental_order or payment */
  kind?: string | undefined;
  direction?: 'credit' | 'debit' | undefined;
  /** createdAt range by calendar day in Viet Nam (UTC+7), both days included */
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

/** Money of a user that is not spendable yet but still theirs (VND). */
export interface WalletHoldings {
  /** Rent + deposit of their paid, unsettled rentals (held in escrow). */
  rentals: number;
  /** Purchases of their paid, unsettled buy-now orders (held in escrow). */
  purchases?: number;
  /** Their withdrawal requests not paid out yet (held in escrow). */
  withdrawals: number;
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

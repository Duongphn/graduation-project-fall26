import { type ClientSession } from 'mongoose';
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
  kind: 'rental_order' | 'admin_credit';
  id: string;
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
  ): Promise<{ items: IWalletTransaction[]; total: number }>;
}

import type { Types } from 'mongoose';
import type { WalletOwnerType, WalletStatus } from '../models/wallet.model.js';
import type { WalletTransactionType } from '../models/wallet-transaction.model.js';

export interface WalletDto {
  id: string;
  userId: string | null;
  ownerType: WalletOwnerType;
  balance: number;
  availableBalance?: number | undefined;
  holdingBalance?: number | undefined;
  currency: string;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionReferenceDto {
  kind?: string | undefined;
  id?: string | undefined;
}

export interface WalletTransactionDto {
  id: string;
  walletId: string;
  entryKey: string;
  postingKey: string;
  amount: number;
  type: WalletTransactionType;
  balanceBefore?: number | undefined;
  balanceAfter?: number | undefined;
  reference?: WalletTransactionReferenceDto | undefined;
  description?: string | undefined;
  createdAt: string;
}

export interface PaginatedTransactionsDto {
  items: WalletTransactionDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage?: boolean | undefined;
  hasPrevPage?: boolean | undefined;
}

export interface ReferenceInput {
  kind: string;
  id: string | Types.ObjectId;
}

export interface LedgerTransferInput {
  postingKey: string;
  fromWalletId: string | Types.ObjectId;
  toWalletId: string | Types.ObjectId;
  amount: number;
  reference?: ReferenceInput | undefined;
  description?: string | undefined;
}

export interface LedgerSingleEntryInput {
  postingKey: string;
  walletId: string | Types.ObjectId;
  amount: number;
  type: WalletTransactionType;
  entryKeySuffix?: string | undefined;
  reference?: ReferenceInput | undefined;
  description?: string | undefined;
}

export interface EscrowDistributionInput {
  postingKey: string;
  escrowWalletId?: string | Types.ObjectId | undefined;
  beneficiaryWalletId: string | Types.ObjectId;
  beneficiaryAmount: number;
  platformFeeWalletId?: string | Types.ObjectId | undefined;
  platformFeeAmount: number;
  refundWalletId?: string | Types.ObjectId | undefined;
  refundAmount?: number | undefined;
  reference?: ReferenceInput | undefined;
  description?: string | undefined;
}

export interface LedgerResult {
  postingKey: string;
  idempotentReplay: boolean;
  transactions: WalletTransactionDto[];
}

export interface BankInfoDto {
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
}

export interface CreateWithdrawalInput {
  amount: number;
  bankInfo: BankInfoDto;
}

export interface WithdrawalRequestDto {
  id: string;
  code?: string | undefined;
  userId: string;
  amount: number;
  bankInfo: BankInfoDto;
  status: string;
  processedBy?: string | undefined;
  notes?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedWithdrawalsDto {
  items: WithdrawalRequestDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage?: boolean | undefined;
  hasPrevPage?: boolean | undefined;
}



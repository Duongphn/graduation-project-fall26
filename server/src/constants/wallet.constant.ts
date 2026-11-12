export const WALLET_OWNER_TYPES = ['user', 'escrow', 'platform_fee', 'platform'] as const;

export const WALLET_STATUSES = ['active', 'frozen', 'closed'] as const;

export const TRANSACTION_TYPES = ['credit', 'debit'] as const;

export const SYSTEM_WALLET_TYPES = {
  ESCROW: 'escrow',
  PLATFORM_FEE: 'platform_fee',
  PLATFORM: 'platform',
} as const;

export const REFERENCE_KINDS = {
  RENTAL_ORDER: 'rental_order',
  PURCHASE_ORDER: 'purchase_order',
  PAYMENT: 'payment',
  WITHDRAWAL: 'withdrawal',
  DEPOSIT_REFUND: 'deposit_refund',
  PLATFORM_FEE: 'platform_fee',
  ADJUSTMENT: 'adjustment',
} as const;

export const WITHDRAWAL_LIMITS = {
  MIN_AMOUNT: 50_000,
  MAX_AMOUNT: 20_000_000,
} as const;

export const WITHDRAWAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];


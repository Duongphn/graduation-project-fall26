// What a ledger posting is about (wallet_transactions.reference.kind) and the history filters.

export const ledgerReferenceKinds = ['rental_order', 'admin_credit', 'topup', 'withdrawal'] as const;
export type LedgerReferenceKind = (typeof ledgerReferenceKinds)[number];

/** Filter "Loại" on the wallet history screen → the reference kinds it covers. */
export const walletTransactionTypeKinds = {
  rental: ['rental_order'],
  topup: ['topup'],
  withdrawal: ['withdrawal'],
  admin_credit: ['admin_credit'],
} as const satisfies Record<string, readonly LedgerReferenceKind[]>;

export const walletTransactionTypes = Object.keys(walletTransactionTypeKinds) as [
  WalletTransactionType,
  ...WalletTransactionType[],
];
export type WalletTransactionType = keyof typeof walletTransactionTypeKinds;

export const walletTransactionDirections = ['credit', 'debit'] as const;
export type WalletTransactionDirection = (typeof walletTransactionDirections)[number];

/**
 * Rental statuses whose rent + deposit (pricing.totalPayable) sit in escrow: paid by the renter,
 * not settled yet. Shown to the renter as "Đang tạm giữ".
 */
export const ESCROW_HELD_RENTAL_STATUSES = [
  'PAID',
  'SHIPPING',
  'IN_USE',
  'RETURNING',
  'DISPUTING',
] as const;

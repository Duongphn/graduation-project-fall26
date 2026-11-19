// What a ledger posting is about (wallet_transactions.reference.kind) and the history filters.

/** `payment` is a VNPay top-up, as in the lead's payment service. */
export const ledgerReferenceKinds = ['rental_order', 'admin_credit', 'payment', 'withdrawal'] as const;
export type LedgerReferenceKind = (typeof ledgerReferenceKinds)[number];

/** `type` filter of GET /wallets/me/transactions: money in, money out or both. */
export const walletTransactionListTypes = ['all', 'credit', 'debit'] as const;
export type WalletTransactionListType = (typeof walletTransactionListTypes)[number];

/** One VNPay top-up (UC17), same limits as the lead's validateTopupInput. */
export const TOPUP_LIMITS = { MIN_AMOUNT: 10_000, MAX_AMOUNT: 100_000_000 } as const;

/** Minutes the VNPay payment link stays valid (vnp_ExpireDate) */
export const TOPUP_LINK_MINUTES = 15;

/**
 * Extra minutes before the expiry job marks a still-pending top-up as failed. VNPay can send the
 * IPN of a payment made just before the link expired a little later; failing it too early would
 * refuse money the user really paid.
 */
export const TOPUP_EXPIRY_GRACE_MINUTES = 15;

/** One withdrawal request (UC18), same limits as the lead's WITHDRAWAL_LIMITS. */
export const WITHDRAWAL_LIMITS = { MIN_AMOUNT: 50_000, MAX_AMOUNT: 20_000_000 } as const;

/** Withdrawal statuses whose amount is still held in escrow (not paid out, not refunded). */
export const HELD_WITHDRAWAL_STATUSES = ['pending', 'approved'] as const;

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

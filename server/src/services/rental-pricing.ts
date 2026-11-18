import { type RentalPeriod, type RentalPricing, type RentalSettings } from '../types/rental-order.types.js';
import { type LedgerEntry } from '../interfaces/wallet.ports.js';
import { AppError } from '../utils/app-error.js';
import { inclusiveDays, rentalEnd } from './rental-time.js';

const DAY_MS = 86_400_000;

/**
 * Calculates rental pricing snapshot.
 */
export function quotePricing(
  toy: { priceOrRate: number; depositPrice?: number | undefined },
  period: RentalPeriod,
  settings: RentalSettings,
): RentalPricing {
  const days = inclusiveDays(period);
  const dailyRate = toy.priceOrRate;
  const rentalFee = days * dailyRate;
  const depositAmount = toy.depositPrice ?? 0;
  const platformFeeRate = settings.platformFeeRate;
  const platformFee = Math.round(rentalFee * platformFeeRate);
  const totalPayable = rentalFee + depositAmount;

  return {
    days,
    dailyRate,
    rentalFee,
    depositAmount,
    platformFeeRate,
    platformFee,
    totalPayable,
  };
}

/**
 * Calculates late fee based on actual return time and deposit cap.
 */
export function computeLateFee(
  input: { endDate: Date; dailyRate: number; depositAmount: number },
  requestedAt: Date,
  settings: RentalSettings,
): { lateDays: number; lateFee: number } {
  const end = rentalEnd(input.endDate);
  const diffMs = requestedAt.getTime() - end.getTime();
  const lateDays = diffMs > 0 ? Math.ceil(diffMs / DAY_MS) : 0;
  const rawLateFee = Math.round(lateDays * input.dailyRate * settings.lateFeeMultiplier);
  const lateFee = Math.min(rawLateFee, input.depositAmount);

  return {
    lateDays,
    lateFee,
  };
}

export interface SettleWallets {
  escrow: string;
  owner: string;
  platform: string;
  renter: string;
}

/**
 * Bút toán quyết toán GOOD: escrow −(R+D); owner +(R−F+L); platform +F; renter +(D−L).
 * Bỏ các dòng 0 đồng; tổng luôn bằng 0.
 */
export function settlementEntries(
  amounts: { rentalFee: number; depositAmount: number; platformFee: number; lateFee: number },
  wallets: SettleWallets,
): LedgerEntry[] {
  const { rentalFee: R, depositAmount: D, platformFee: F, lateFee: L } = amounts;
  return [
    { walletId: wallets.escrow, amount: -(R + D) },
    { walletId: wallets.owner, amount: R - F + L },
    { walletId: wallets.platform, amount: F },
    { walletId: wallets.renter, amount: D - L },
  ].filter((entry) => entry.amount !== 0);
}

export type ClaimantRole = 'renter' | 'owner';

export interface DisputeAmounts {
  rentalFee: number;
  depositAmount: number;
  platformFee: number;
  lateFee: number;
}

export interface Payout {
  renter: number;
  owner: number;
  platform: number;
}

/** Maximum compensation: owner claimant D − L; renter claimant R. */
export function disputeCompensationCap(amounts: DisputeAmounts, role: ClaimantRole): number {
  return role === 'owner' ? Math.max(0, amounts.depositAmount - amounts.lateFee) : amounts.rentalFee;
}

/** Split of escrow R + D after a dispute verdict with compensation X. */
export function disputePayout(amounts: DisputeAmounts, role: ClaimantRole, compensation: number): Payout {
  const { rentalFee: R, depositAmount: D, platformFee: F, lateFee: L } = amounts;
  const max = disputeCompensationCap(amounts, role);
  if (compensation > max) {
    throw new AppError(400, 'COMPENSATION_TOO_HIGH', 'Số tiền bồi thường vượt mức tối đa cho phép.', { max });
  }
  if (role === 'owner') {
    return { owner: R - F + L + compensation, platform: F, renter: D - L - compensation };
  }
  const platform = R === 0 ? 0 : Math.round((F * (R - compensation)) / R);
  return { renter: D + compensation, owner: R - compensation - platform, platform };
}

/** Ledger entries for a dispute payout: escrow −(R+D), zero lines dropped. */
export function disputeSettlementEntries(
  payout: Payout,
  totalEscrow: number,
  wallets: SettleWallets,
): LedgerEntry[] {
  return [
    { walletId: wallets.escrow, amount: -totalEscrow },
    { walletId: wallets.owner, amount: payout.owner },
    { walletId: wallets.platform, amount: payout.platform },
    { walletId: wallets.renter, amount: payout.renter },
  ].filter((entry) => entry.amount !== 0);
}

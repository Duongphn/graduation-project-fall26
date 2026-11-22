import { type RentalPeriod, type RentalPricing, type RentalSettings } from '../types/rental-order.types.js';
import { type LedgerEntry } from '../interfaces/wallet.ports.js';
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

export interface RulingAmounts {
  rentalFee: number;
  depositAmount: number;
  platformFeeRate: number;
  lateFee: number;
  /** K: bồi thường cho chủ đồ, lấy từ tiền cọc */
  compensation: number;
  /** G: tiền thuê hoàn cho người thuê */
  rentRefund: number;
}

export interface RulingSplit {
  /** R + D: toàn bộ tiền đang bị giữ ở escrow */
  frozen: number;
  /** R − G − F' + L + K */
  owner: number;
  /** F' = p × (R − G) */
  platform: number;
  /** D − L − K + G */
  renter: number;
}

/**
 * Chia tiền theo phán quyết khiếu nại đơn thuê (R03 I.2.6.6): escrow trả hết R + D trong một bút toán.
 * Giới hạn: L + K ≤ D (bồi thường chỉ lấy từ cọc) và G ≤ R.
 */
export function rulingSplit(amounts: RulingAmounts): RulingSplit {
  const {
    rentalFee: R,
    depositAmount: D,
    platformFeeRate: p,
    lateFee: L,
    compensation: K,
    rentRefund: G,
  } = amounts;
  if (![K, G].every((v) => Number.isInteger(v) && v >= 0)) {
    throw new Error('INVALID_RULING_AMOUNT');
  }
  if (L + K > D || G > R) {
    throw new Error('RULING_EXCEEDS_LIMIT');
  }
  const platform = Math.round(p * (R - G));
  return {
    frozen: R + D,
    owner: R - G - platform + L + K,
    platform,
    renter: D - L - K + G,
  };
}

/** Bút toán phán quyết: escrow −(R + D), chia cho chủ đồ, nền tảng, người thuê; bỏ dòng 0 đồng. */
export function rulingEntries(split: RulingSplit, wallets: SettleWallets): LedgerEntry[] {
  return [
    { walletId: wallets.escrow, amount: -split.frozen },
    { walletId: wallets.owner, amount: split.owner },
    { walletId: wallets.platform, amount: split.platform },
    { walletId: wallets.renter, amount: split.renter },
  ].filter((entry) => entry.amount !== 0);
}

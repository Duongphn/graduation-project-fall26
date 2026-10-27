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

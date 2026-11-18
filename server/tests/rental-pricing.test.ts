import { describe, expect, it } from 'vitest';
import {
  computeLateFee,
  disputeCompensationCap,
  disputePayout,
  disputeSettlementEntries,
  quotePricing,
  settlementEntries,
} from '../src/services/rental-pricing.js';
import { parseDateOnly } from '../src/services/rental-time.js';
import { DEFAULT_RENTAL_SETTINGS } from '../src/types/rental-order.types.js';

describe('rental-pricing', () => {
  const period = { startDate: parseDateOnly('2026-11-05')!, endDate: parseDateOnly('2026-11-07')! };

  it('quotes rent, deposit and owner-paid fee', () => {
    expect(quotePricing({ priceOrRate: 50_000, depositPrice: 200_000 }, period, DEFAULT_RENTAL_SETTINGS)).toEqual({
      days: 3,
      dailyRate: 50_000,
      rentalFee: 150_000,
      depositAmount: 200_000,
      platformFeeRate: 0.1,
      platformFee: 15_000,
      totalPayable: 350_000,
    });
  });

  it('rounds the fee and defaults deposit to 0', () => {
    const p = quotePricing({ priceOrRate: 33_333 }, { ...period, endDate: period.startDate }, DEFAULT_RENTAL_SETTINGS);
    expect(p.platformFee).toBe(3_333);
    expect(p.depositAmount).toBe(0);
    expect(p.totalPayable).toBe(33_333);
  });

  it('charges late days rounded up and caps at the deposit', () => {
    const input = { endDate: period.endDate, dailyRate: 50_000, depositAmount: 200_000 };
    const s = DEFAULT_RENTAL_SETTINGS;
    expect(computeLateFee(input, new Date('2026-11-07T16:59:00Z'), s)).toEqual({ lateDays: 0, lateFee: 0 });
    expect(computeLateFee(input, new Date('2026-11-09T03:00:00Z'), s)).toEqual({ lateDays: 2, lateFee: 100_000 });
    expect(computeLateFee(input, new Date('2026-11-12T03:00:00Z'), s)).toEqual({ lateDays: 5, lateFee: 200_000 });
    expect(computeLateFee({ ...input, depositAmount: 0 }, new Date('2026-11-09T03:00:00Z'), s).lateFee).toBe(0);
  });

  describe('settlementEntries', () => {
    const wallets = { escrow: 'E', owner: 'O', platform: 'P', renter: 'R' };
    const amounts = (entries: { walletId: string; amount: number }[]) =>
      Object.fromEntries(entries.map((e) => [e.walletId, e.amount]));

    it('releases escrow to owner, platform and renter', () => {
      const entries = settlementEntries({ rentalFee: 150_000, depositAmount: 200_000, platformFee: 15_000, lateFee: 0 }, wallets);
      expect(amounts(entries)).toEqual({ E: -350_000, O: 135_000, P: 15_000, R: 200_000 });
    });

    it('moves the late fee from the deposit to the owner', () => {
      const entries = settlementEntries({ rentalFee: 150_000, depositAmount: 200_000, platformFee: 15_000, lateFee: 100_000 }, wallets);
      expect(amounts(entries)).toEqual({ E: -350_000, O: 235_000, P: 15_000, R: 100_000 });
    });

    it('omits zero-amount entries and always sums to zero', () => {
      const entries = settlementEntries({ rentalFee: 150_000, depositAmount: 0, platformFee: 15_000, lateFee: 0 }, wallets);
      expect(entries.map((e) => e.walletId)).toEqual(['E', 'O', 'P']);
      expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(0);
    });
  });
});

describe('dispute payout (UC19)', () => {
  const base = { rentalFee: 100_000, depositAmount: 200_000, platformFee: 10_000, lateFee: 0 };
  const wallets = { escrow: 'esc', owner: 'own', platform: 'plat', renter: 'ren' };

  const check = (payout: { renter: number; owner: number; platform: number }) => {
    expect(payout.renter + payout.owner + payout.platform).toBe(300_000);
    expect(Math.min(payout.renter, payout.owner, payout.platform)).toBeGreaterThanOrEqual(0);
    const entries = disputeSettlementEntries(payout, 300_000, wallets);
    expect(entries.reduce((sum, e) => sum + e.amount, 0)).toBe(0);
    expect(entries.every((e) => e.amount !== 0)).toBe(true);
  };

  it('owner claimant, no late fee', () => {
    expect(disputeCompensationCap(base, 'owner')).toBe(200_000);
    const payout = disputePayout(base, 'owner', 50_000);
    expect(payout).toEqual({ owner: 140_000, platform: 10_000, renter: 150_000 });
    check(payout);
  });

  it('owner claimant, with late fee', () => {
    const amounts = { ...base, lateFee: 30_000 };
    expect(disputeCompensationCap(amounts, 'owner')).toBe(170_000);
    const payout = disputePayout(amounts, 'owner', 170_000);
    expect(payout.renter).toBe(0);
    check(payout);
    try {
      disputePayout(amounts, 'owner', 170_001);
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400, code: 'COMPENSATION_TOO_HIGH', details: { max: 170_000 } });
    }
  });

  it('owner claimant, late fee equals deposit', () => {
    expect(disputeCompensationCap({ ...base, lateFee: 200_000 }, 'owner')).toBe(0);
  });

  it('renter claimant', () => {
    expect(disputeCompensationCap(base, 'renter')).toBe(100_000);
    const none = disputePayout(base, 'renter', 0);
    expect(none).toEqual({ renter: 200_000, owner: 90_000, platform: 10_000 });
    check(none);
    const partial = disputePayout(base, 'renter', 40_000);
    expect(partial).toEqual({ renter: 240_000, owner: 54_000, platform: 6_000 });
    check(partial);
    const full = disputePayout(base, 'renter', 100_000);
    expect(full).toEqual({ renter: 300_000, owner: 0, platform: 0 });
    check(full);
  });
});

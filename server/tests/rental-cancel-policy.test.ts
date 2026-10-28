import { describe, expect, it } from 'vitest';
import { type RentalOrderStatus } from '../src/constants/rental-order-status.js';
import { decideRentalCancel } from '../src/services/rental-cancel-policy.js';
import { splitCancelRefund, type CancelActorRole } from '../src/types/order-cancel.types.js';

describe('rental cancel policy and splitCancelRefund', () => {
  const baseOrder = {
    pricing: { rentalFee: 150_000, totalPayable: 350_000 },
    period: { startDate: new Date('2026-11-05T00:00:00Z') },
  };
  const baseNow = new Date('2026-11-01T03:00:00Z');
  const settings = { cancelFeeRate: 0.2 };

  describe('splitCancelRefund', () => {
    it('splits total into fee and refund when fee is within [0, total]', () => {
      expect(splitCancelRefund(350_000, 30_000)).toEqual({ fee: 30_000, refund: 320_000 });
    });

    it('clamps fee to total when fee > total', () => {
      expect(splitCancelRefund(100, 150)).toEqual({ fee: 100, refund: 0 });
    });

    it('clamps fee to 0 when fee < 0', () => {
      expect(splitCancelRefund(100, -5)).toEqual({ fee: 0, refund: 100 });
    });
  });

  describe('decideRentalCancel matrix', () => {
    type MatrixCase = [
      status: RentalOrderStatus,
      by: CancelActorRole,
      expected:
        | { allowed: true; fee: number; refund: number }
        | { allowed: false; code: string },
    ];

    const cases: MatrixCase[] = [
      ['PENDING', 'RENTER', { allowed: true, fee: 0, refund: 0 }],
      ['PENDING', 'OWNER', { allowed: false, code: 'RENTAL_CANCEL_USE_REJECT' }],
      ['ACCEPTED', 'RENTER', { allowed: true, fee: 0, refund: 0 }],
      ['ACCEPTED', 'OWNER', { allowed: true, fee: 0, refund: 0 }],
      ['PAID', 'RENTER', { allowed: true, fee: 30_000, refund: 320_000 }],
      ['PAID', 'OWNER', { allowed: true, fee: 0, refund: 350_000 }],
      ['SHIPPING', 'RENTER', { allowed: false, code: 'RENTAL_CANCEL_NOT_ALLOWED' }],
      ['SHIPPING', 'OWNER', { allowed: false, code: 'RENTAL_CANCEL_NOT_ALLOWED' }],
      ['IN_USE', 'RENTER', { allowed: false, code: 'RENTAL_CANCEL_NOT_ALLOWED' }],
      ['IN_USE', 'OWNER', { allowed: false, code: 'RENTAL_CANCEL_NOT_ALLOWED' }],
      ['RETURNING', 'RENTER', { allowed: false, code: 'RENTAL_CANCEL_NOT_ALLOWED' }],
      ['RETURNING', 'OWNER', { allowed: false, code: 'RENTAL_CANCEL_NOT_ALLOWED' }],
      ['DISPUTING', 'RENTER', { allowed: false, code: 'RENTAL_CANCEL_NOT_ALLOWED' }],
      ['DISPUTING', 'OWNER', { allowed: false, code: 'RENTAL_CANCEL_NOT_ALLOWED' }],
      ['COMPLETED', 'RENTER', { allowed: false, code: 'INVALID_RENTAL_TRANSITION' }],
      ['COMPLETED', 'OWNER', { allowed: false, code: 'INVALID_RENTAL_TRANSITION' }],
      ['REJECTED', 'RENTER', { allowed: false, code: 'INVALID_RENTAL_TRANSITION' }],
      ['REJECTED', 'OWNER', { allowed: false, code: 'INVALID_RENTAL_TRANSITION' }],
      ['EXPIRED', 'RENTER', { allowed: false, code: 'INVALID_RENTAL_TRANSITION' }],
      ['EXPIRED', 'OWNER', { allowed: false, code: 'INVALID_RENTAL_TRANSITION' }],
      ['CANCELLED', 'RENTER', { allowed: false, code: 'INVALID_RENTAL_TRANSITION' }],
      ['CANCELLED', 'OWNER', { allowed: false, code: 'INVALID_RENTAL_TRANSITION' }],
    ];

    it.each(cases)('status %s cancelled by %s', (status, by, expected) => {
      const decision = decideRentalCancel(
        { ...baseOrder, status },
        by as 'RENTER' | 'OWNER',
        baseNow,
        settings,
      );

      if (expected.allowed) {
        expect(decision).toEqual(expected);
      } else {
        expect(decision.allowed).toBe(false);
        if (!decision.allowed) {
          expect(decision.code).toBe(expected.code);
          expect(decision.message).toBeTruthy();
        }
      }
    });
  });

  describe('timing boundaries and rate variations for PAID renter cancel', () => {
    it('waives cancel fee when now >= startOfRental (owner has not shipped)', () => {
      // startDate 2026-11-05 UTC midnight -> startOfRental is 2026-11-04T17:00:00.000Z
      const exactStart = new Date('2026-11-04T17:00:00.000Z');
      const decision = decideRentalCancel(
        { ...baseOrder, status: 'PAID' },
        'RENTER',
        exactStart,
        settings,
      );
      expect(decision).toEqual({ allowed: true, fee: 0, refund: 350_000 });
    });

    it('charges cancel fee 1 millisecond before startOfRental', () => {
      const justBefore = new Date('2026-11-04T16:59:59.999Z');
      const decision = decideRentalCancel(
        { ...baseOrder, status: 'PAID' },
        'RENTER',
        justBefore,
        settings,
      );
      expect(decision).toEqual({ allowed: true, fee: 30_000, refund: 320_000 });
    });

    it('rounds cancel fee with Math.round', () => {
      const order = {
        pricing: { rentalFee: 50_001, totalPayable: 250_001 },
        period: { startDate: new Date('2026-11-05T00:00:00Z') },
        status: 'PAID' as const,
      };
      // 50_001 * 0.2 = 10000.2 -> Math.round -> 10000
      const decision = decideRentalCancel(order, 'RENTER', baseNow, settings);
      expect(decision).toEqual({ allowed: true, fee: 10_000, refund: 240_001 });
    });

    it('handles cancelFeeRate = 0', () => {
      const decision = decideRentalCancel(
        { ...baseOrder, status: 'PAID' },
        'RENTER',
        baseNow,
        { cancelFeeRate: 0 },
      );
      expect(decision).toEqual({ allowed: true, fee: 0, refund: 350_000 });
    });

    it('handles cancelFeeRate = 1', () => {
      const decision = decideRentalCancel(
        { ...baseOrder, status: 'PAID' },
        'RENTER',
        baseNow,
        { cancelFeeRate: 1 },
      );
      expect(decision).toEqual({ allowed: true, fee: 150_000, refund: 200_000 });
    });
  });
});

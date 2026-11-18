import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { computeFinancialBreakdown } from '../../src/services/rental-financial-breakdown.js';
import type { IRentalOrder } from '../../src/models/rental-order.model.js';

const baseOrder: IRentalOrder = {
  _id: new Types.ObjectId(),
  code: 'RO261118A1B2C3',
  renterId: new Types.ObjectId(),
  ownerId: new Types.ObjectId(),
  toyId: new Types.ObjectId(),
  period: { startDate: new Date('2026-11-20'), endDate: new Date('2026-11-25') },
  pricing: {
    days: 6,
    dailyRate: 50000,
    rentalFee: 300000,
    depositAmount: 500000,
    platformFeeRate: 0.1,
    platformFee: 30000,
    totalPayable: 800000,
  },
  status: 'PENDING',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const completedOrder: IRentalOrder = {
  ...baseOrder,
  status: 'COMPLETED',
  settlement: { result: 'GOOD', settledAt: new Date('2026-11-26') },
};

describe('computeFinancialBreakdown', () => {
  describe('COMPLETED state', () => {
    it('computes correct settlement breakdown for renter when completed without late fee', () => {
      const res = computeFinancialBreakdown(completedOrder, 'renter');
      expect(res.role).toBe('renter');
      expect(res.currency).toBe('VND');
      expect(res.isEstimated).toBe(false);
      expect(res.settlementStatus).toBe('SETTLED');
      expect(res.items.rentalFee).toBe(300000);
      expect(res.items.depositPaid).toBe(500000);
      expect(res.items.lateFee).toBe(0);
      expect(res.items.depositRefunded).toBe(500000);
      expect(res.items.totalActualCost).toBe(300000);
      expect(res.summary.status).toBe('SETTLED');
      expect(res.summary.description).toBeTruthy();
    });

    it('computes owner earnings with platform fee deduction when completed without late fee', () => {
      const res = computeFinancialBreakdown(completedOrder, 'owner');
      expect(res.role).toBe('owner');
      expect(res.currency).toBe('VND');
      expect(res.isEstimated).toBe(false);
      expect(res.payoutStatus).toBe('PAID_OUT');
      expect(res.items.grossRentalFee).toBe(300000);
      expect(res.items.platformFeeRate).toBe(0.1);
      expect(res.items.platformFee).toBe(30000);
      expect(res.items.lateCompensation).toBe(0);
      expect(res.items.netEarnings).toBe(270000);
      expect(res.summary.status).toBe('PAID_OUT');
      expect(res.summary.description).toBeTruthy();
    });

    it('accounts for late fee and late compensation on completed order', () => {
      const completedWithLate: IRentalOrder = {
        ...completedOrder,
        returnInfo: {
          requestedAt: new Date('2026-11-26T10:00:00.000Z'),
          lateDays: 1,
          lateFee: 50000,
          photos: [],
        },
      };

      const renterRes = computeFinancialBreakdown(completedWithLate, 'renter');
      expect(renterRes.items.lateFee).toBe(50000);
      expect(renterRes.items.depositRefunded).toBe(450000);
      expect(renterRes.items.totalActualCost).toBe(350000);

      const ownerRes = computeFinancialBreakdown(completedWithLate, 'owner');
      expect(ownerRes.items.lateCompensation).toBe(50000);
      expect(ownerRes.items.netEarnings).toBe(320000); // 300000 - 30000 + 50000
    });
  });

  describe('DISPUTING state', () => {
    const disputedOrder: IRentalOrder = {
      ...baseOrder,
      status: 'DISPUTING',
    };

    it('freezes deposit with 0 refund and flags isEstimated for renter', () => {
      const renterRes = computeFinancialBreakdown(disputedOrder, 'renter');
      expect(renterRes.role).toBe('renter');
      expect(renterRes.settlementStatus).toBe('DISPUTED');
      expect(renterRes.isEstimated).toBe(true);
      expect(renterRes.items.depositPaid).toBe(500000);
      expect(renterRes.items.depositRefunded).toBe(0);
      expect(renterRes.items.totalActualCost).toBe(300000);
      expect(renterRes.summary.status).toBe('DISPUTED');
      expect(renterRes.summary.description.toLowerCase()).toContain('khiếu nại');
    });

    it('freezes netEarnings at 0 and flags isEstimated for owner', () => {
      const ownerRes = computeFinancialBreakdown(disputedOrder, 'owner');
      expect(ownerRes.role).toBe('owner');
      expect(ownerRes.payoutStatus).toBe('DISPUTED');
      expect(ownerRes.isEstimated).toBe(true);
      expect(ownerRes.items.grossRentalFee).toBe(300000);
      expect(ownerRes.items.netEarnings).toBe(0);
      expect(ownerRes.summary.status).toBe('DISPUTED');
      expect(ownerRes.summary.description.toLowerCase()).toContain('khiếu nại');
    });
  });

  describe('RETURNING state with late days', () => {
    const lateOrder: IRentalOrder = {
      ...baseOrder,
      status: 'RETURNING',
      returnInfo: {
        requestedAt: new Date(),
        lateDays: 2,
        lateFee: 100000,
        photos: [],
      },
    };

    it('deducts late fee from estimated refund for renter', () => {
      const renterRes = computeFinancialBreakdown(lateOrder, 'renter');
      expect(renterRes.settlementStatus).toBe('HELD_IN_ESCROW');
      expect(renterRes.isEstimated).toBe(true);
      expect(renterRes.items.lateFee).toBe(100000);
      expect(renterRes.items.depositRefunded).toBe(400000);
      expect(renterRes.items.totalActualCost).toBe(400000);
    });

    it('includes late compensation in estimated net earnings for owner', () => {
      const ownerRes = computeFinancialBreakdown(lateOrder, 'owner');
      expect(ownerRes.payoutStatus).toBe('ESCROW_HELD');
      expect(ownerRes.isEstimated).toBe(true);
      expect(ownerRes.items.lateCompensation).toBe(100000);
      expect(ownerRes.items.netEarnings).toBe(370000); // 300000 - 30000 + 100000
    });
  });

  describe('In-flight states (PENDING, ACCEPTED, PAID, SHIPPING, IN_USE)', () => {
    it('handles PENDING and ACCEPTED before payment', () => {
      const pendingOrder: IRentalOrder = {
        ...baseOrder,
        status: 'PENDING',
      };

      const renterRes = computeFinancialBreakdown(pendingOrder, 'renter');
      expect(renterRes.settlementStatus).toBe('PENDING_PAYMENT');
      expect(renterRes.isEstimated).toBe(true);
      expect(renterRes.items.depositPaid).toBe(0);
      expect(renterRes.items.depositRefunded).toBe(0);
      expect(renterRes.items.totalActualCost).toBe(300000);

      const ownerRes = computeFinancialBreakdown(pendingOrder, 'owner');
      expect(ownerRes.payoutStatus).toBe('WAITING_PAYMENT');
      expect(ownerRes.isEstimated).toBe(true);
      expect(ownerRes.items.netEarnings).toBe(270000);
    });

    it('handles PAID and IN_USE when funds are held in escrow', () => {
      const inUseOrder: IRentalOrder = {
        ...baseOrder,
        status: 'IN_USE',
      };

      const renterRes = computeFinancialBreakdown(inUseOrder, 'renter');
      expect(renterRes.settlementStatus).toBe('HELD_IN_ESCROW');
      expect(renterRes.isEstimated).toBe(true);
      expect(renterRes.items.depositPaid).toBe(500000);
      expect(renterRes.items.depositRefunded).toBe(500000);
      expect(renterRes.items.totalActualCost).toBe(300000);

      const ownerRes = computeFinancialBreakdown(inUseOrder, 'owner');
      expect(ownerRes.payoutStatus).toBe('ESCROW_HELD');
      expect(ownerRes.isEstimated).toBe(true);
      expect(ownerRes.items.netEarnings).toBe(270000);
    });
  });

  describe('Cancelled and terminal failure states', () => {
    it('handles CANCELLED before payment (no money deposited)', () => {
      const cancelledBeforePay: IRentalOrder = {
        ...baseOrder,
        status: 'CANCELLED',
      };

      const renterRes = computeFinancialBreakdown(cancelledBeforePay, 'renter');
      expect(renterRes.settlementStatus).toBe('CANCELLED');
      expect(renterRes.isEstimated).toBe(false);
      expect(renterRes.items.depositPaid).toBe(0);
      expect(renterRes.items.depositRefunded).toBe(0);
      expect(renterRes.items.totalActualCost).toBe(0);

      const ownerRes = computeFinancialBreakdown(cancelledBeforePay, 'owner');
      expect(ownerRes.payoutStatus).toBe('CANCELLED');
      expect(ownerRes.isEstimated).toBe(false);
      expect(ownerRes.items.netEarnings).toBe(0);
    });

    it('handles CANCELLED after payment (reflects full refund)', () => {
      const cancelledAfterPay: IRentalOrder & { isPaid: boolean } = {
        ...baseOrder,
        status: 'CANCELLED',
        isPaid: true,
      };

      const renterRes = computeFinancialBreakdown(cancelledAfterPay, 'renter');
      expect(renterRes.settlementStatus).toBe('REFUNDED');
      expect(renterRes.isEstimated).toBe(false);
      expect(renterRes.items.depositPaid).toBe(500000);
      expect(renterRes.items.depositRefunded).toBe(500000);
      expect(renterRes.items.totalActualCost).toBe(0);

      const ownerRes = computeFinancialBreakdown(cancelledAfterPay, 'owner');
      expect(ownerRes.payoutStatus).toBe('CANCELLED');
      expect(ownerRes.isEstimated).toBe(false);
      expect(ownerRes.items.netEarnings).toBe(0);
    });

    it('handles REJECTED and EXPIRED states', () => {
      const rejectedOrder: IRentalOrder = {
        ...baseOrder,
        status: 'REJECTED',
      };

      const renterRes = computeFinancialBreakdown(rejectedOrder, 'renter');
      expect(renterRes.settlementStatus).toBe('CANCELLED');
      expect(renterRes.isEstimated).toBe(false);
      expect(renterRes.items.totalActualCost).toBe(0);

      const expiredOrder: IRentalOrder = {
        ...baseOrder,
        status: 'EXPIRED',
      };
      const ownerRes = computeFinancialBreakdown(expiredOrder, 'owner');
      expect(ownerRes.payoutStatus).toBe('CANCELLED');
      expect(ownerRes.items.netEarnings).toBe(0);
    });
  });

  describe('admin view', () => {
    it('computes combined breakdown with platform revenue and 0 escrow balance for COMPLETED order', () => {
      const adminRes = computeFinancialBreakdown(completedOrder, 'admin');
      expect(adminRes.role).toBe('admin');
      expect(adminRes.currency).toBe('VND');
      expect(adminRes.isEstimated).toBe(false);
      expect(adminRes.settlementStatus).toBe('SETTLED');
      expect(adminRes.payoutStatus).toBe('PAID_OUT');
      expect(adminRes.platformRevenue).toBe(30000);
      expect(adminRes.items.escrowBalance).toBe(0);
      expect(adminRes.items.platformRevenue).toBe(30000);
      expect(adminRes.items.rentalFee).toBe(300000);
      expect(adminRes.items.depositRefunded).toBe(500000);
      expect(adminRes.items.grossRentalFee).toBe(300000);
      expect(adminRes.items.netEarnings).toBe(270000);

      // Nested views
      expect(adminRes.renter?.role).toBe('renter');
      expect(adminRes.owner?.role).toBe('owner');
    });

    it('shows active escrow balance for in-flight PAID/IN_USE order', () => {
      const inFlightOrder: IRentalOrder = {
        ...baseOrder,
        status: 'IN_USE',
      };

      const adminRes = computeFinancialBreakdown(inFlightOrder, 'admin');
      expect(adminRes.isEstimated).toBe(true);
      expect(adminRes.items.escrowBalance).toBe(800000);
      expect(adminRes.settlementStatus).toBe('HELD_IN_ESCROW');
      expect(adminRes.payoutStatus).toBe('ESCROW_HELD');
    });

    it('shows frozen escrow balance and 0 platform revenue for DISPUTING order', () => {
      const disputedOrder: IRentalOrder = {
        ...baseOrder,
        status: 'DISPUTING',
      };

      const adminRes = computeFinancialBreakdown(disputedOrder, 'admin');
      expect(adminRes.settlementStatus).toBe('DISPUTED');
      expect(adminRes.payoutStatus).toBe('DISPUTED');
      expect(adminRes.items.escrowBalance).toBe(800000);
      expect(adminRes.platformRevenue).toBe(0);
      expect(adminRes.items.netEarnings).toBe(0);
    });
  });
});

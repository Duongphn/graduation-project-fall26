import { describe, expect, it } from 'vitest';
import { rentalOrderStatuses } from '../../src/constants/rental-order-status.js';
import {
  STATUS_GROUP_MAP,
  type AdminFinancialBreakdownDto,
  type OwnerFinancialBreakdownDto,
  type RentalCounterpartDto,
  type RentalFinancialBreakdownDto,
  type RentalListQuery,
  type RentalOrderDetailDto,
  type RentalOrderItemDto,
  type RentalPayoutStatus,
  type RentalSettlementStatus,
  type RentalStatusGroup,
  type RentalTimelineActorDto,
  type RentalTimelineEntryDto,
  type RentalToySummaryDto,
  type RenterFinancialBreakdownDto,
} from '../../src/types/rental-order.types.js';

describe('UC16 Rental Types & DTO contracts', () => {
  describe('STATUS_GROUP_MAP and RentalStatusGroup', () => {
    it('maps all status groups to expected status arrays', () => {
      const groups: RentalStatusGroup[] = [
        'all',
        'pending',
        'active',
        'completed',
        'cancelled',
        'disputed',
      ];
      expect(Object.keys(STATUS_GROUP_MAP).sort()).toEqual(groups.sort());

      expect(STATUS_GROUP_MAP.all).toEqual(expect.arrayContaining([...rentalOrderStatuses]));
      expect(STATUS_GROUP_MAP.pending).toEqual(['PENDING']);
      expect(STATUS_GROUP_MAP.active).toEqual([
        'ACCEPTED',
        'PAID',
        'SHIPPING',
        'IN_USE',
        'RETURNING',
      ]);
      expect(STATUS_GROUP_MAP.completed).toEqual(['COMPLETED']);
      expect(STATUS_GROUP_MAP.cancelled).toEqual(['CANCELLED', 'REJECTED', 'EXPIRED']);
      expect(STATUS_GROUP_MAP.disputed).toEqual(['DISPUTING']);
    });
  });

  describe('RentalTimelineEntryDto and RentalTimelineActorDto', () => {
    it('defines valid shapes for timeline entry with human actor', () => {
      const actor: RentalTimelineActorDto = {
        id: '673998b3c8f8b80012345680',
        name: 'Nguyễn Văn A',
        role: 'owner',
        isSystem: false,
      };

      const entry: RentalTimelineEntryDto = {
        oldStatus: 'PENDING',
        newStatus: 'ACCEPTED',
        changedBy: actor,
        notes: 'Chủ đồ chơi chấp nhận đơn thuê',
        occurredAt: new Date('2026-11-18T10:00:00.000Z'),
      };

      expect(entry.changedBy.isSystem).toBe(false);
      expect(entry.changedBy.id).toBe('673998b3c8f8b80012345680');
      expect(entry.newStatus).toBe('ACCEPTED');
    });

    it('defines valid shapes for timeline entry with system actor', () => {
      const systemActor: RentalTimelineActorDto = {
        id: null,
        name: 'Hệ thống',
        role: 'system',
        isSystem: true,
      };

      const entry: RentalTimelineEntryDto = {
        oldStatus: 'ACCEPTED',
        newStatus: 'EXPIRED',
        changedBy: systemActor,
        notes: 'Hết hạn thanh toán',
        occurredAt: new Date('2026-11-18T12:00:00.000Z'),
      };

      expect(entry.changedBy.isSystem).toBe(true);
      expect(entry.changedBy.id).toBeNull();
      expect(entry.changedBy.name).toBe('Hệ thống');
    });
  });

  describe('RentalFinancialBreakdownDto variants', () => {
    it('validates RenterFinancialBreakdownDto shape', () => {
      const settlementStatus: RentalSettlementStatus = 'SETTLED';
      const renterBreakdown: RenterFinancialBreakdownDto = {
        role: 'renter',
        currency: 'VND',
        isEstimated: false,
        settlementStatus,
        items: {
          rentalFee: 300000,
          depositPaid: 500000,
          lateFee: 50000,
          depositRefunded: 450000,
          totalActualCost: 350000,
        },
        summary: {
          status: 'SETTLED',
          description: 'Đơn thuê đã quyết toán hoàn tất.',
        },
      };

      const breakdown: RentalFinancialBreakdownDto = renterBreakdown;
      expect(breakdown.role).toBe('renter');
      expect(breakdown.isEstimated).toBe(false);
      if (breakdown.role === 'renter') {
        expect(breakdown.items.depositRefunded).toBe(450000);
        expect(breakdown.items.totalActualCost).toBe(350000);
      }
    });

    it('validates OwnerFinancialBreakdownDto shape', () => {
      const payoutStatus: RentalPayoutStatus = 'PAID_OUT';
      const ownerBreakdown: OwnerFinancialBreakdownDto = {
        role: 'owner',
        currency: 'VND',
        isEstimated: false,
        payoutStatus,
        items: {
          grossRentalFee: 300000,
          platformFeeRate: 0.1,
          platformFee: 30000,
          lateCompensation: 50000,
          netEarnings: 320000,
        },
        summary: {
          status: 'PAID_OUT',
          description: 'Tiền đã được giải ngân vào ví.',
        },
      };

      const breakdown: RentalFinancialBreakdownDto = ownerBreakdown;
      expect(breakdown.role).toBe('owner');
      if (breakdown.role === 'owner') {
        expect(breakdown.items.netEarnings).toBe(320000);
        expect(breakdown.items.platformFee).toBe(30000);
      }
    });

    it('validates AdminFinancialBreakdownDto shape', () => {
      const adminBreakdown: AdminFinancialBreakdownDto = {
        role: 'admin',
        currency: 'VND',
        isEstimated: false,
        settlementStatus: 'SETTLED',
        payoutStatus: 'PAID_OUT',
        items: {
          rentalFee: 300000,
          depositPaid: 500000,
          lateFee: 50000,
          depositRefunded: 450000,
          totalActualCost: 350000,
          grossRentalFee: 300000,
          platformFeeRate: 0.1,
          platformFee: 30000,
          lateCompensation: 50000,
          netEarnings: 320000,
          escrowBalance: 0,
        },
        platformRevenue: 30000,
        summary: {
          status: 'SETTLED',
          description: 'Toàn cảnh đơn thuê đã quyết toán.',
        },
      };

      const breakdown: RentalFinancialBreakdownDto = adminBreakdown;
      expect(breakdown.role).toBe('admin');
      if (breakdown.role === 'admin') {
        expect(breakdown.items.escrowBalance).toBe(0);
        expect(breakdown.platformRevenue).toBe(30000);
      }
    });
  });

  describe('RentalOrderItemDto and RentalOrderDetailDto', () => {
    it('validates RentalOrderItemDto shape for list response', () => {
      const toy: RentalToySummaryDto = {
        id: '673998b3c8f8b80012345679',
        name: 'Bộ xếp hình Lego Technic',
        slug: 'bo-xep-hinh-lego-technic',
        primaryImage: 'https://example.com/lego.jpg',
        dailyRate: 50000,
        depositAmount: 500000,
      };

      const counterpart: RentalCounterpartDto = {
        id: '673998b3c8f8b80012345680',
        fullName: 'Nguyễn Văn A',
        avatar: 'https://example.com/avatar.jpg',
        trustScore: 90,
        verified: true,
        role: 'owner',
      };

      const item: RentalOrderItemDto = {
        id: '673998b3c8f8b80012345678',
        code: 'RO261118A1B2C3',
        role: 'renter',
        status: 'IN_USE',
        period: {
          startDate: '2026-11-20',
          endDate: '2026-11-25',
        },
        pricing: {
          days: 6,
          dailyRate: 50000,
          rentalFee: 300000,
          depositAmount: 500000,
          totalPayable: 800000,
        },
        toy,
        counterpart,
        timer: {
          kind: 'RETURN_REMINDER',
          dueAt: new Date('2026-11-25T17:00:00.000Z'),
        },
        createdAt: new Date('2026-11-18T08:00:00.000Z'),
        updatedAt: new Date('2026-11-18T09:30:00.000Z'),
      };

      expect(item.code).toBe('RO261118A1B2C3');
      expect(item.role).toBe('renter');
      expect(item.toy?.name).toBe('Bộ xếp hình Lego Technic');
      expect(item.counterpart?.fullName).toBe('Nguyễn Văn A');
    });

    it('validates RentalOrderDetailDto extended shape', () => {
      const detail: RentalOrderDetailDto = {
        id: '673998b3c8f8b80012345678',
        code: 'RO261118A1B2C3',
        toyId: '673998b3c8f8b80012345679',
        renterId: '673998b3c8f8b80012345681',
        ownerId: '673998b3c8f8b80012345680',
        period: {
          startDate: '2026-11-20',
          endDate: '2026-11-25',
        },
        pricing: {
          days: 6,
          dailyRate: 50000,
          rentalFee: 300000,
          depositAmount: 500000,
          platformFeeRate: 0.1,
          platformFee: 30000,
          totalPayable: 800000,
        },
        status: 'COMPLETED',
        toy: {
          id: '673998b3c8f8b80012345679',
          name: 'Bộ xếp hình Lego Technic',
          slug: 'bo-xep-hinh-lego-technic',
          dailyRate: 50000,
          depositAmount: 500000,
        },
        renter: {
          id: '673998b3c8f8b80012345681',
          fullName: 'Trần Thị B',
          verified: true,
        },
        owner: {
          id: '673998b3c8f8b80012345680',
          fullName: 'Nguyễn Văn A',
          verified: true,
        },
        timeline: [
          {
            newStatus: 'PENDING',
            changedBy: { id: '673998b3c8f8b80012345681', name: 'Trần Thị B', role: 'renter', isSystem: false },
            occurredAt: new Date(),
          },
        ],
        financialBreakdown: {
          role: 'renter',
          currency: 'VND',
          isEstimated: false,
          settlementStatus: 'SETTLED',
          items: {
            rentalFee: 300000,
            depositPaid: 500000,
            lateFee: 0,
            depositRefunded: 500000,
            totalActualCost: 300000,
          },
          summary: {
            status: 'SETTLED',
            description: 'Đã quyết toán hoàn tất',
          },
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(detail.timeline).toHaveLength(1);
      expect(detail.financialBreakdown?.role).toBe('renter');
      expect(detail.toy?.dailyRate).toBe(50000);
      expect(detail.owner?.fullName).toBe('Nguyễn Văn A');
    });
  });

  describe('RentalListQuery shape', () => {
    it('validates RentalListQuery interface options', () => {
      const query: RentalListQuery = {
        role: 'all',
        status: ['ACCEPTED', 'PAID'],
        group: 'active',
        page: 2,
        limit: 15,
      };

      expect(query.role).toBe('all');
      expect(query.group).toBe('active');
      expect(query.status).toEqual(['ACCEPTED', 'PAID']);
    });
  });
});

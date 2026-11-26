import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import {
  toRentalOrderDetailDto,
  toRentalOrderDto,
  toRentalOrderItemDto,
} from '../../src/services/rental-order.mapper.js';
import {
  type EnrichedRentalOrderDoc,
} from '../../src/repositories/rental-order.repository.js';
import {
  type RentalFinancialBreakdownDto,
  type RentalPartyProfileDto,
  type RentalTimelineEntryDto,
  type RentalToySummaryDto,
} from '../../src/types/rental-order.types.js';

describe('rental-order.mapper', () => {
  const dummyOrderId = new Types.ObjectId();
  const dummyToyId = new Types.ObjectId();
  const dummyRenterId = new Types.ObjectId();
  const dummyOwnerId = new Types.ObjectId();

  const baseOrderDoc = {
    _id: dummyOrderId,
    code: 'RO261118A1B2C3',
    toyId: dummyToyId,
    renterId: dummyRenterId,
    ownerId: dummyOwnerId,
    period: {
      startDate: new Date('2026-11-20T00:00:00.000Z'),
      endDate: new Date('2026-11-25T00:00:00.000Z'),
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
    status: 'IN_USE' as const,
    timer: {
      kind: 'RETURN_REMINDER' as const,
      dueAt: new Date('2026-11-25T17:00:00.000Z'),
    },
    handover: {
      ownerPhotos: [],
      shippedAt: new Date('2026-11-20T08:00:00.000Z'),
      renterPhotos: [],
      receivedAt: new Date('2026-11-20T10:00:00.000Z'),
      autoConfirmed: false,
    },
    rentalStartedAt: new Date('2026-11-20T10:00:00.000Z'),
    returnInfo: {
      photos: [],
      note: 'Trả đúng hạn',
      requestedAt: new Date('2026-11-25T16:00:00.000Z'),
      lateDays: 0,
      lateFee: 0,
    },
    settlement: {
      result: 'GOOD' as const,
      settledAt: new Date('2026-11-26T09:00:00.000Z'),
      autoSettled: false,
    },
    createdAt: new Date('2026-11-18T08:00:00.000Z'),
    updatedAt: new Date('2026-11-26T09:00:00.000Z'),
  };

  const toySummary: RentalToySummaryDto = {
    id: dummyToyId.toString(),
    name: 'Lego Technic 42115',
    slug: 'lego-technic-42115',
    primaryImage: 'https://example.com/toy.jpg',
    dailyRate: 50000,
    depositAmount: 500000,
  };

  const counterpartOwner = {
    id: dummyOwnerId.toString(),
    fullName: 'Owner Name',
    avatar: 'https://example.com/owner.jpg',
    trustScore: 95,
    verified: true,
    role: 'owner' as const,
  };

  const enrichedRenterDoc: EnrichedRentalOrderDoc = {
    ...baseOrderDoc,
    role: 'renter',
    toy: toySummary,
    counterpart: counterpartOwner,
  } as unknown as EnrichedRentalOrderDoc;

  describe('toRentalOrderItemDto', () => {
    it('strips platformFee and platformFeeRate for renter', () => {
      const dto = toRentalOrderItemDto(enrichedRenterDoc, 'renter');

      expect(dto.role).toBe('renter');
      expect(dto.pricing.rentalFee).toBe(300000);
      expect(dto.pricing.depositAmount).toBe(500000);
      expect(dto.pricing.totalPayable).toBe(800000);
      expect(dto.pricing.platformFee).toBeUndefined();
      expect(dto.pricing.platformFeeRate).toBeUndefined();
      expect(dto.toy).toEqual(toySummary);
      expect(dto.counterpart).toEqual(counterpartOwner);
      expect(dto.period.startDate).toBe('2026-11-20');
      expect(dto.period.endDate).toBe('2026-11-25');
    });

    it('preserves platformFee and platformFeeRate for owner', () => {
      const enrichedOwnerDoc: EnrichedRentalOrderDoc = {
        ...baseOrderDoc,
        role: 'owner',
        toy: toySummary,
        counterpart: {
          id: dummyRenterId.toString(),
          fullName: 'Renter Name',
          verified: true,
          role: 'renter',
        },
      } as unknown as EnrichedRentalOrderDoc;

      const dto = toRentalOrderItemDto(enrichedOwnerDoc, 'owner');

      expect(dto.role).toBe('owner');
      expect(dto.pricing.platformFee).toBe(30000);
      expect(dto.pricing.platformFeeRate).toBe(0.1);
      expect(dto.counterpart?.role).toBe('renter');
    });

    it('preserves platform fees and doc.role for admin / all queries', () => {
      const dto = toRentalOrderItemDto(enrichedRenterDoc, 'all');

      expect(dto.role).toBe('renter');
      expect(dto.pricing.platformFee).toBe(30000);
      expect(dto.pricing.platformFeeRate).toBe(0.1);
    });

    it('defaults to stripping fees if doc.role is renter and actorRole is omitted', () => {
      const dto = toRentalOrderItemDto(enrichedRenterDoc);

      expect(dto.role).toBe('renter');
      expect(dto.pricing.platformFee).toBeUndefined();
    });

    it('handles timer omissions when timer is not set or partial', () => {
      const orderWithoutTimer = {
        ...baseOrderDoc,
        timer: undefined,
      };

      const dto = toRentalOrderItemDto(orderWithoutTimer as any, 'renter');
      expect(dto.timer).toBeUndefined();
    });
  });

  describe('toRentalOrderDetailDto', () => {
    it('enriches order with toy, renter, owner, timeline, and financialBreakdown', () => {
      const renterProfile: RentalPartyProfileDto = {
        id: dummyRenterId.toString(),
        fullName: 'Renter Name',
        avatar: 'https://example.com/renter.jpg',
        trustScore: 88,
        verified: true,
        role: 'renter',
      };

      const ownerProfile: RentalPartyProfileDto = {
        id: dummyOwnerId.toString(),
        fullName: 'Owner Name',
        avatar: 'https://example.com/owner.jpg',
        trustScore: 95,
        verified: true,
        role: 'owner',
      };

      const timeline: RentalTimelineEntryDto[] = [
        {
          oldStatus: null,
          newStatus: 'PENDING',
          changedBy: {
            id: dummyRenterId.toString(),
            name: 'Renter Name',
            role: 'renter',
            isSystem: false,
          },
          notes: 'Tạo đơn',
          occurredAt: new Date('2026-11-18T08:00:00.000Z'),
        },
      ];

      const financialBreakdown: RentalFinancialBreakdownDto = {
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
          description: 'Quyết toán xong',
        },
      };

      const detail = toRentalOrderDetailDto(baseOrderDoc as any, {
        toy: toySummary,
        renter: renterProfile,
        owner: ownerProfile,
        timeline,
        financialBreakdown,
      });

      expect(detail.id).toBe(dummyOrderId.toString());
      expect(detail.code).toBe('RO261118A1B2C3');
      expect(detail.toy).toEqual(toySummary);
      expect(detail.renter).toEqual(renterProfile);
      expect(detail.owner).toEqual(ownerProfile);
      expect(detail.timeline).toHaveLength(1);
      expect(detail.timeline?.[0]?.changedBy.name).toBe('Renter Name');
      expect(detail.financialBreakdown).toEqual(financialBreakdown);
    });

    it('works when extras are partially provided or empty', () => {
      const detail = toRentalOrderDetailDto(baseOrderDoc as any, {});

      expect(detail.id).toBe(dummyOrderId.toString());
      expect(detail.toy).toBeUndefined();
      expect(detail.renter).toBeUndefined();
      expect(detail.owner).toBeUndefined();
      expect(detail.timeline).toBeUndefined();
      expect(detail.financialBreakdown).toBeUndefined();
    });
  });

  describe('toRentalOrderDto', () => {
    it('maps base order properties and converts ObjectIds to strings', () => {
      const dto = toRentalOrderDto(baseOrderDoc as any);

      expect(dto.id).toBe(dummyOrderId.toString());
      expect(dto.toyId).toBe(dummyToyId.toString());
      expect(dto.renterId).toBe(dummyRenterId.toString());
      expect(dto.ownerId).toBe(dummyOwnerId.toString());
      expect(dto.period.startDate).toBe('2026-11-20');
      expect(dto.period.endDate).toBe('2026-11-25');
    });
  });
});

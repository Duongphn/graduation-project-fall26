import type { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';

import { DisputeModel } from '../../src/features/disputes/disputes.model.js';
import { DonationRequestModel } from '../../src/features/donation_requests/donation_requests.model.js';
import { OrderStatusHistoryModel } from '../../src/features/order_status_history/order_status_history.model.js';
import { PurchaseOrderModel } from '../../src/features/purchase_orders/purchase_orders.model.js';
import {
  acceptRentalOrder,
  CalendarConflictError,
} from '../../src/features/rental_orders/rental_orders.repository.js';
import { RentalOrderModel } from '../../src/features/rental_orders/rental_orders.model.js';
import { ReviewModel } from '../../src/features/reviews/reviews.model.js';
import { ToyModel } from '../../src/features/toys/toys.model.js';
import { createToy, day, newId, useTestDatabase } from './helpers.js';

useTestDatabase();

let orderNumber = 0;

const requestRental = (toyId: Types.ObjectId, ownerId: Types.ObjectId, from: number, to: number) =>
  RentalOrderModel.create({
    code: `R-${++orderNumber}`,
    renterId: newId(),
    ownerId,
    toyId,
    period: { startDate: day(from), endDate: day(to) },
    pricing: {
      rentPerDay: 20_000,
      days: to - from,
      rentalFee: 20_000 * (to - from),
      deposit: 300_000,
      total: 20_000 * (to - from) + 300_000,
    },
  });

describe('rental calendar', () => {
  it('accepts only one of two concurrent overlapping requests', async () => {
    const toy = await createToy();
    const first = await requestRental(toy._id, toy.ownerId, 1, 5);
    const second = await requestRental(toy._id, toy.ownerId, 3, 8);

    const results = await Promise.allSettled([
      acceptRentalOrder(first._id, toy.ownerId),
      acceptRentalOrder(second._id, toy.ownerId),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((result) => result.status === 'rejected');
    expect(failure?.status === 'rejected' && failure.reason).toBeInstanceOf(CalendarConflictError);
    expect(await RentalOrderModel.countDocuments({ toyId: toy._id, status: 'ACCEPTED' })).toBe(1);
    expect(await OrderStatusHistoryModel.countDocuments({ toStatus: 'ACCEPTED' })).toBe(1);
  });

  it('treats bookings as half-open ranges, so back-to-back bookings both succeed', async () => {
    const toy = await createToy();
    const first = await requestRental(toy._id, toy.ownerId, 10, 15);
    const second = await requestRental(toy._id, toy.ownerId, 15, 18);

    await acceptRentalOrder(first._id, toy.ownerId);
    await acceptRentalOrder(second._id, toy.ownerId);

    expect(await RentalOrderModel.countDocuments({ toyId: toy._id, status: 'ACCEPTED' })).toBe(2);
  });

  it('does not let a cancelled booking block the calendar', async () => {
    const toy = await createToy();
    const first = await requestRental(toy._id, toy.ownerId, 20, 25);
    await RentalOrderModel.updateOne({ _id: first._id }, { status: 'CANCELLED' });
    const second = await requestRental(toy._id, toy.ownerId, 21, 24);

    await expect(acceptRentalOrder(second._id, toy.ownerId)).resolves.toBeUndefined();
  });
});

describe('sell once and donate once', () => {
  const purchase = (toyId: Types.ObjectId, sellerId: Types.ObjectId) =>
    PurchaseOrderModel.create({
      code: `P-${++orderNumber}`,
      buyerId: newId(),
      sellerId,
      toyId,
      toyTitle: 'Wooden train set',
      pricing: { price: 150_000 },
    });

  it('reserves a sale toy for only one of two concurrent buyers', async () => {
    const toy = await createToy({ listingType: 'SALE', pricing: { salePrice: 150_000 } });
    const reserve = () =>
      ToyModel.updateOne(
        { _id: toy._id, status: 'ACTIVE', listingType: 'SALE' },
        { $set: { status: 'RESERVED' } },
      );

    const [a, b] = await Promise.all([reserve(), reserve()]);
    expect(a.modifiedCount + b.modifiedCount).toBe(1);
  });

  it('allows a single active purchase order per toy', async () => {
    const toy = await createToy({ listingType: 'SALE', pricing: { salePrice: 150_000 } });
    const first = await purchase(toy._id, toy.ownerId);
    await expect(purchase(toy._id, toy.ownerId)).rejects.toThrow(/duplicate key/);

    await PurchaseOrderModel.updateOne({ _id: first._id }, { status: 'CANCELLED' });
    await expect(purchase(toy._id, toy.ownerId)).resolves.toBeDefined();
  });

  it('allows a single accepted donation request per toy', async () => {
    const toy = await createToy({ listingType: 'DONATION', pricing: {} });
    const request = () =>
      DonationRequestModel.create({
        code: `D-${++orderNumber}`,
        toyId: toy._id,
        donorId: toy.ownerId,
        requestedBy: newId(),
        receiverType: 'USER',
      });

    const first = await request();
    const second = await request();
    await DonationRequestModel.updateOne({ _id: first._id }, { status: 'ACCEPTED' });
    await expect(
      DonationRequestModel.updateOne({ _id: second._id }, { status: 'ACCEPTED' }),
    ).rejects.toThrow(/duplicate key/);
  });

  it('requires an organization for an organization donation', async () => {
    await expect(
      DonationRequestModel.create({
        code: 'D-ORG',
        toyId: newId(),
        donorId: newId(),
        requestedBy: newId(),
        receiverType: 'ORGANIZATION',
      }),
    ).rejects.toThrow(/organization/);
  });
});

describe('disputes and reviews', () => {
  const openDispute = (orderId: Types.ObjectId) =>
    DisputeModel.create({
      code: `DS-${++orderNumber}`,
      orderType: 'RENTAL',
      orderId,
      claimantId: newId(),
      respondentId: newId(),
      reason: 'Damaged',
      description: 'A wheel is broken.',
      evidence: ['https://example.com/broken.jpg'],
      frozenAmount: 300_000,
      respondBy: day(30),
    });

  it('allows one open dispute per order, and a new one after the ruling', async () => {
    const orderId = newId();
    const dispute = await openDispute(orderId);
    await expect(openDispute(orderId)).rejects.toThrow(/duplicate key/);

    dispute.status = 'RESOLVED';
    await expect(dispute.save()).rejects.toThrow(/ruling/);
    dispute.ruling = {
      decidedBy: newId(),
      reason: 'Photos show new damage.',
      toClaimant: 100_000,
      toRespondent: 200_000,
      at: new Date(),
    };
    await dispute.save();

    await expect(openDispute(orderId)).resolves.toBeDefined();
  });

  it('keeps one review per order and reviewer, with whole stars from 1 to 5', async () => {
    const orderId = newId();
    const reviewerId = newId();
    const review = { orderType: 'RENTAL', orderId, reviewerId, revieweeId: newId(), rating: 5 };

    await ReviewModel.create(review);
    await expect(ReviewModel.create(review)).rejects.toThrow(/duplicate key/);
    await expect(
      ReviewModel.create({ ...review, reviewerId: review.revieweeId, revieweeId: reviewerId }),
    ).resolves.toBeDefined();
    await expect(
      ReviewModel.create({ ...review, reviewerId: newId(), rating: 4.5 }),
    ).rejects.toThrow();
    await expect(
      ReviewModel.create({ ...review, reviewerId: newId(), rating: 6 }),
    ).rejects.toThrow();
  });
});

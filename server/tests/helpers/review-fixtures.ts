import mongoose from 'mongoose';
import { RentalOrder, Review, type ReviewDirection } from '../../src/models/index.js';
import { createUser } from './rental-fixtures.js';

export async function seedReceivedReviews(
  revieweeId: string,
  ratings: number[],
  at: Date,
  direction: ReviewDirection = 'RENTER_TO_OWNER',
): Promise<void> {
  for (const rating of ratings) {
    const reviewer = await createUser();
    await Review.create({
      orderType: 'rental_order',
      orderId: new mongoose.Types.ObjectId(),
      direction,
      reviewerId: reviewer._id,
      revieweeId: new mongoose.Types.ObjectId(revieweeId),
      toyId: new mongoose.Types.ObjectId(),
      userRating: rating,
      createdAt: at,
    });
  }
}

let orderCounter = 0;

export async function createCompletedRental(opts: {
  renterId: string | mongoose.Types.ObjectId;
  ownerId: string | mongoose.Types.ObjectId;
  toyId: string | mongoose.Types.ObjectId;
  settledAt: Date;
}) {
  orderCounter += 1;
  return RentalOrder.create({
    code: `RO-REVIEW-${orderCounter}`,
    renterId: opts.renterId,
    ownerId: opts.ownerId,
    toyId: opts.toyId,
    period: {
      startDate: new Date(opts.settledAt.getTime() - 3 * 86_400_000),
      endDate: new Date(opts.settledAt.getTime() - 86_400_000),
    },
    pricing: {
      days: 2,
      dailyRate: 50_000,
      rentalFee: 100_000,
      depositAmount: 200_000,
      platformFeeRate: 0.1,
      platformFee: 10_000,
      totalPayable: 300_000,
    },
    status: 'COMPLETED',
    settlement: { result: 'GOOD', settledAt: opts.settledAt },
  });
}

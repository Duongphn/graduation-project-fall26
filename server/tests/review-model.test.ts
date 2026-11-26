import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Review, Toy } from '../src/models/index.js';
import { isDuplicateKeyError } from '../src/utils/mongo-errors.js';
import { resetDatabase, startReplSet, stopReplSet } from './helpers/replset.js';

describe('Review model', () => {
  beforeAll(async () => {
    await startReplSet();
    await Review.syncIndexes();
  });

  afterAll(async () => {
    await stopReplSet();
  });

  beforeEach(async () => {
    await resetDatabase();
    await Review.syncIndexes();
  });

  const base = () => ({
    orderType: 'rental_order' as const,
    orderId: new mongoose.Types.ObjectId(),
    direction: 'RENTER_TO_OWNER' as const,
    reviewerId: new mongoose.Types.ObjectId(),
    revieweeId: new mongoose.Types.ObjectId(),
    toyId: new mongoose.Types.ObjectId(),
    userRating: 5,
  });

  it('rejects a second review by the same reviewer for the same order', async () => {
    const doc = base();
    await Review.create(doc);
    let error: unknown;
    try {
      await Review.create({ ...doc, userRating: 4 });
    } catch (err) {
      error = err;
    }
    expect(isDuplicateKeyError(error, 'review_once_per_order')).toBe(true);
  });

  it('rejects userRating outside 1-5 and non-integers', async () => {
    for (const userRating of [0, 6, 4.5]) {
      await expect(new Review({ ...base(), userRating }).validate()).rejects.toThrow();
    }
  });

  it('toy rating defaults to 0/0', async () => {
    const toy = await Toy.create({
      ownerId: new mongoose.Types.ObjectId(),
      categoryId: new mongoose.Types.ObjectId(),
      title: 'Lego',
      description: 'd',
      condition: 'good',
      listingType: 'rent',
      priceOrRate: 1000,
      ageRange: { minAge: 3, maxAge: 8 },
    });
    expect(toy.rating).toMatchObject({ sum: 0, count: 0 });
  });
});

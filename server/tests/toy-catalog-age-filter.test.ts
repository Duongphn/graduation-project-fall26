import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';

import { Toy } from '../src/models/toy.model.js';
import { MongoToyCatalogRepository } from '../src/repositories/toy-catalog.repository.js';
import { useTestDatabase } from './support/test-database.js';

// The home showcase age filter uses half-open ranges [minAge, maxAge) like the R03 age groups
// (0-1, 1-3, 3-6, 6-12, 12+): a 1-3 toy and a 6-12 toy are not in the 3-6 group.
useTestDatabase();

const repository = new MongoToyCatalogRepository();

const toy = (title: string, minAge: number, maxAge: number) =>
  Toy.create({
    ownerId: new mongoose.Types.ObjectId(),
    categoryId: new mongoose.Types.ObjectId(),
    title,
    description: 'Đồ chơi dùng cho kiểm thử bộ lọc độ tuổi của trang chủ, còn tốt, đủ chi tiết.',
    condition: 'good',
    listingType: 'rent',
    priceOrRate: 50_000,
    depositPrice: 200_000,
    status: 'active',
    ageRange: { minAge, maxAge },
    images: [{ url: 'https://example.com/1.jpg', publicId: `t-${title}` }],
    quantity: 1,
  });

describe('MongoToyCatalogRepository age filter', () => {
  it('matches only the toys whose age range overlaps the half-open group', async () => {
    await toy('1-3', 1, 3);
    await toy('3-6', 3, 6);
    await toy('6-12', 6, 12);
    await toy('age 3 only', 3, 3);
    await toy('2-4', 2, 4);

    const titles = async (minAge: number, maxAge: number) =>
      (await repository.findNewest({ minAge, maxAge, excludeIds: [] }, 0, 20))
        .map((t) => t.title)
        .sort();

    expect(await titles(3, 6)).toEqual(['2-4', '3-6', 'age 3 only']);
    expect(await titles(1, 3)).toEqual(['1-3', '2-4']);
    expect(await titles(6, 12)).toEqual(['6-12']);
    expect(await repository.count({ minAge: 3, maxAge: 6, excludeIds: [] })).toBe(3);
  });
});

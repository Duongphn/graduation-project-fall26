import { randomBytes } from 'node:crypto';

import mongoose, { Types, type ClientSession } from 'mongoose';
import { afterAll, beforeAll, inject } from 'vitest';

import { syncDatabase } from '../../src/app/models.js';
import { ToyModel } from '../../src/features/toys/toys.model.js';

/**
 * Connects to the shared one-node replica set started by tests/setup/mongo-global-setup.ts
 * (transactions need a replica set), on a database of this test file only, and syncs every model.
 */
export const useTestDatabase = (): void => {
  const dbName = `toyflow_test_${randomBytes(6).toString('hex')}`;

  beforeAll(async () => {
    await mongoose.connect(inject('mongoUri'), { dbName });
    await syncDatabase();
  }, 120_000);

  afterAll(async () => {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
  });
};

export const newId = (): Types.ObjectId => new Types.ObjectId();

export const createToy = (overrides: Record<string, unknown> = {}) =>
  ToyModel.create({
    ownerId: newId(),
    categoryId: newId(),
    title: 'Wooden train set',
    description: 'Complete set with 20 pieces.',
    images: ['https://example.com/1.jpg'],
    condition: 'GOOD',
    ageGroup: 'AGE_3_5',
    listingType: 'RENT',
    pricing: { rentPerDay: 20_000, deposit: 300_000 },
    status: 'ACTIVE',
    area: 'Cau Giay, Ha Noi',
    location: { type: 'Point', coordinates: [105.79, 21.03] },
    ...overrides,
  });

export const day = (n: number): Date => new Date(Date.UTC(2026, 10, n));

/**
 * Runs `work` in a transaction that stays open until `commit()` is called: lets a test hold a
 * write while another request runs, to check that the two write-conflict.
 */
export const openTransaction = async (work: (session: ClientSession) => Promise<unknown>) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  await work(session);
  return {
    commit: async () => {
      await session.commitTransaction();
      await session.endSession();
    },
  };
};

/** Starts a supertest request now (supertest is lazy) and resolves with its response. */
export const startRequest = <T>(test: PromiseLike<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    test.then(resolve, reject);
  });

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

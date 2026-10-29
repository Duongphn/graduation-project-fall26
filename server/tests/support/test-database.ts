import { randomBytes } from 'node:crypto';

import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, inject } from 'vitest';

/**
 * Connects to the shared one-node replica set started by tests/setup/mongo-global-setup.ts
 * (transactions need a replica set), on a database of this test file only, and builds the
 * indexes of every model the test file has imported (develop's schemas).
 */
export const useTestDatabase = (): void => {
  const dbName = `toyflow_test_${randomBytes(6).toString('hex')}`;

  beforeAll(async () => {
    await mongoose.connect(inject('mongoUri'), { dbName });
    for (const name of mongoose.modelNames()) {
      await mongoose.model(name).createCollection();
      // Some develop indexes use `$ne: null` in partialFilterExpression, which MongoDB refuses;
      // skip the indexes that cannot be built instead of failing the whole file.
      await mongoose
        .model(name)
        .syncIndexes()
        .catch(() => undefined);
    }
  }, 120_000);

  afterAll(async () => {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect();
  });
};

export const newId = (): Types.ObjectId => new Types.ObjectId();

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

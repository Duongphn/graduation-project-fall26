import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

// One in-memory replica set (transactions need one) for the whole run. Every test file gets
// its own database on it (tests/database/helpers.ts), so files still run in parallel without
// each starting a mongod of its own (many mongods at once caused ECONNRESET on start-up).
export default async function setup(project: TestProject) {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  project.provide('mongoUri', replSet.getUri());
  return async () => {
    await replSet.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

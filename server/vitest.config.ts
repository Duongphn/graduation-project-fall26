import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    clearMocks: true,
    include: ['tests/**/*.test.ts'],
    // One shared in-memory MongoDB replica set for the feature tests (a database per file).
    globalSetup: ['tests/setup/mongo-global-setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});

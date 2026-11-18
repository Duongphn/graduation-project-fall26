import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    clearMocks: true,
    include: ['tests/**/*.test.ts'],
    // The server has no fallback JWT secrets (config/env.ts); tests sign with these.
    env: {
      JWT_ACCESS_SECRET: 'test_access_secret_not_for_production',
      JWT_REFRESH_SECRET: 'test_refresh_secret_not_for_production',
    },
    // One shared in-memory MongoDB replica set for the feature tests (a database per file).
    globalSetup: ['tests/setup/mongo-global-setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});

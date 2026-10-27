import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    clearMocks: true,
    include: ['tests/**/*.test.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});

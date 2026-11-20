import { afterEach, describe, expect, it } from 'vitest';

import { isExplicitDevelopment } from '../src/services/auth.service.js';

// R03 III.1.2.1 (10): the development-only OTP shortcut opens only when NODE_ENV is set to
// "development"; a missing NODE_ENV (env.nodeEnv falls back to "development") keeps it closed.
const saved = process.env.NODE_ENV;
afterEach(() => {
  if (saved === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = saved;
});

describe('isExplicitDevelopment', () => {
  it('is false without NODE_ENV and for production or test', () => {
    delete process.env.NODE_ENV;
    expect(isExplicitDevelopment()).toBe(false);
    process.env.NODE_ENV = 'production';
    expect(isExplicitDevelopment()).toBe(false);
    process.env.NODE_ENV = 'test';
    expect(isExplicitDevelopment()).toBe(false);
  });
});

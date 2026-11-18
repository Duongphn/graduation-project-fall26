import { describe, expect, it } from 'vitest';
import { DEFAULT_RENTAL_SETTINGS } from '../src/types/rental-order.types.js';

describe('default rental time limits', () => {
  it('gives the Owner 48 hours to inspect a returned toy (GB-22, UC12 alt 4.2)', () => {
    expect(DEFAULT_RENTAL_SETTINGS.settlementHours).toBe(48);
  });
});

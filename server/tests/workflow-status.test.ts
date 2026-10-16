import { describe, expect, it } from 'vitest';

import {
  donationStatuses,
  rentalOrderStatuses,
  resaleOrderStatuses,
} from '../src/shared/domain/statuses.js';

describe('workflow status catalog', () => {
  it('keeps Shipping as a visible status in all three lifecycle flows', () => {
    expect(rentalOrderStatuses).toContain('SHIPPING');
    expect(resaleOrderStatuses).toContain('SHIPPING');
    expect(donationStatuses).toContain('SHIPPING');
  });

  it('keeps rental and resale lifecycle catalogs separate', () => {
    expect(rentalOrderStatuses).toContain('RETURNING');
    expect(resaleOrderStatuses).not.toContain('RETURNING');
  });
});

import { describe, expect, it } from 'vitest';

import { donationStatuses } from '../src/features/donations/domain/donation-status.js';
import { rentalOrderStatuses } from '../src/features/rental-orders/domain/rental-order-status.js';
import { resaleOrderStatuses } from '../src/features/resale-orders/domain/resale-order-status.js';

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

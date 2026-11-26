import {
  RENTAL_POLICY_FIELDS,
  type RentalOrderPolicy,
  type RentalSettings,
} from '../types/rental-order.types.js';

/** The copy of the time limits kept on a new rental order (GB-38). */
export const rentalPolicyOf = (settings: RentalSettings): RentalOrderPolicy =>
  Object.fromEntries(
    RENTAL_POLICY_FIELDS.map((field) => [field, settings[field]]),
  ) as unknown as RentalOrderPolicy;

/**
 * Settings for a later step of an order: the time limits and late fee multiplier the order was
 * created with, the latest values for the rest. An order created before UC30 has no copy and
 * keeps using the latest values, as before.
 */
export const withOrderPolicy = (
  current: RentalSettings,
  policy: Partial<RentalOrderPolicy> | null | undefined,
): RentalSettings => {
  if (!policy) return current;
  const merged = { ...current };
  for (const field of RENTAL_POLICY_FIELDS) {
    const value = policy[field];
    if (typeof value === 'number' && Number.isFinite(value)) merged[field] = value;
  }
  return merged;
};

import type { TransitionMap } from '../utils/transitions.js';

/** Stored visibility of an organization (develop's model: 'active' by default). */
export const organizationStatuses = ['active', 'hidden'] as const;
export type OrganizationStatus = (typeof organizationStatuses)[number];

/** active (Donors can choose it) <-> hidden. Created as active: the Admin has checked it. */
export const organizationTransitions: TransitionMap<OrganizationStatus> = {
  active: ['hidden'],
  hidden: ['active'],
};

/** Donation request statuses still in progress (stored lowercase by develop's model). */
export const openDonationStatuses = ['pending', 'accepted', 'shipping'] as const;

export interface AgeRange {
  minAge: number;
  maxAge: number;
}

/**
 * The accepted age groups of a needs profile (GB-53, S3): 0–12 months, 1–3, 3–6, 6–12 and 12+
 * years. Stored like a toy's ageRange, in years and half-open: [minAge, maxAge). 12+ is [12, 99),
 * the value the toy forms use.
 */
export const ORGANIZATION_AGE_GROUPS: readonly AgeRange[] = [
  { minAge: 0, maxAge: 1 },
  { minAge: 1, maxAge: 3 },
  { minAge: 3, maxAge: 6 },
  { minAge: 6, maxAge: 12 },
  { minAge: 12, maxAge: 99 },
];

export const isOrganizationAgeGroup = (range: AgeRange): boolean =>
  ORGANIZATION_AGE_GROUPS.some(
    (group) => group.minAge === range.minAge && group.maxAge === range.maxAge,
  );

/**
 * GB-54: a toy's age range overlaps an age group. Both are half-open [minAge, maxAge); a toy
 * for one age only (minAge === maxAge, e.g. { 3, 3 }) counts as [minAge, minAge + 1).
 */
export const ageRangesOverlap = (toy: AgeRange, group: AgeRange): boolean => {
  const toyMax = Math.max(toy.maxAge, toy.minAge + 1);
  return toy.minAge < group.maxAge && toyMax > group.minAge;
};

/** How many organizations the GB-54 suggestion returns at most. */
export const MAX_ORGANIZATION_SUGGESTIONS = 50;

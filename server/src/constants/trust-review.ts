// Admin review of Renters blocked by a low Trust Score (UC29, FE-09, GB-29).

/** The Admin's three answers to a review: lift the block, keep it, or lock the account. */
export const trustDecisionActions = ['lift', 'keep', 'lock'] as const;
export type TrustDecisionAction = (typeof trustDecisionActions)[number];

/**
 * Refused checks of the same toy within this many minutes count as one blocked attempt: the
 * booking card asks for a quote again when the Renter changes the dates or comes back to the tab.
 */
export const TRUST_ATTEMPT_MERGE_MINUTES = 30;

/** GB-29: every account starts at 100; an account with no score stored yet counts as 100. */
export const STARTING_TRUST_SCORE = 100;

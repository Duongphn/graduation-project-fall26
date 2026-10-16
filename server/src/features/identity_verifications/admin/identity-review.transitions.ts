import type { VerificationStatus } from '../../../shared/domain/statuses.js';

// BF-01 review: a PENDING request is decided once. A new submission is a new document.
// Proposed for shared/domain/transitions.ts as `verificationTransitions`.
export const verificationTransitions: Readonly<
  Record<VerificationStatus, readonly VerificationStatus[]>
> = {
  PENDING: ['VERIFIED', 'REJECTED'],
  VERIFIED: [],
  REJECTED: [],
};

import type { TransitionMap } from '../../../shared/utils/transitions.js';
import type { VerificationStatus } from '../identity-verification.ports.js';

/** Status values stored by develop's identity_verifications model. */
export const verificationStatuses = ['pending', 'verified', 'rejected'] as const;

// A pending request is decided once. A new submission is a new document.
export const verificationTransitions: TransitionMap<VerificationStatus> = {
  pending: ['verified', 'rejected'],
  verified: [],
  rejected: [],
};

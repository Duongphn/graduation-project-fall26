export const RENTER_DISPUTE_REASONS = ['DAMAGED_ON_RECEIPT', 'MISSING_PARTS', 'NOT_AS_DESCRIBED', 'OTHER'] as const;
export const OWNER_DISPUTE_REASONS = ['DAMAGED_ON_RETURN', 'MISSING_PARTS', 'OTHER'] as const;
export const DISPUTE_VERDICTS = ['CLAIMANT_FAVORED', 'RESPONDENT_FAVORED', 'PARTIAL'] as const;

export type DisputeReason =
  | (typeof RENTER_DISPUTE_REASONS)[number]
  | (typeof OWNER_DISPUTE_REASONS)[number];
export type DisputeVerdict = (typeof DISPUTE_VERDICTS)[number];
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'closed';

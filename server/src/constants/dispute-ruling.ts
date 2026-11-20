// Phán quyết khiếu nại của Admin (UC19, R03 III.7.4.1 field 9–10).

/** Bên có lỗi theo phán quyết (field 9). */
export const disputeRulings = [
  'RENTER_AT_FAULT',
  'OWNER_AT_FAULT',
  'UNDETERMINED',
  'FAIR_WEAR_AND_TEAR',
] as const;
export type DisputeRuling = (typeof disputeRulings)[number];

/** Tỷ lệ bồi thường (field 10): K theo phần trăm tiền cọc, hoặc G theo phần trăm tiền thuê. */
export const compensationRates = [0, 25, 50, 75, 100] as const;
export type CompensationRate = (typeof compensationRates)[number];

/** Khiếu nại còn chờ Admin quyết định. */
export const OPEN_DISPUTE_STATUSES = ['open', 'under_review'] as const;

/** Phán quyết là "bên bị khiếu nại có lỗi" thì mới có bồi thường / hoàn tiền thuê. */
export const rulingUpholdsClaim = (ruling: DisputeRuling, claimant: 'owner' | 'renter'): boolean =>
  claimant === 'owner' ? ruling === 'RENTER_AT_FAULT' : ruling === 'OWNER_AT_FAULT';

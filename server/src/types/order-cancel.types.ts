export const rentalCancelActors = ['RENTER', 'OWNER'] as const;
export type RentalCancelActor = (typeof rentalCancelActors)[number];

export type CancelActorRole = RentalCancelActor | 'BUYER' | 'SELLER';

export type CancelDecision =
  | { allowed: true; fee: number; refund: number }
  | { allowed: false; code: string; message: string };

/**
 * Split escrow funds between a cancel fee and a buyer/renter refund.
 * Clamps fee to [0, total]; refund is total - clampedFee.
 */
export const splitCancelRefund = (
  total: number,
  fee: number,
): { fee: number; refund: number } => {
  const clampedFee = Math.min(Math.max(fee, 0), Math.max(total, 0));
  const refund = Math.max(total - clampedFee, 0);
  return { fee: clampedFee, refund };
};

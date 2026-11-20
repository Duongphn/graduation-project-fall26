import { type Types } from 'mongoose';

export interface TrustSnapshot {
  score: number | null;
  reviewCount: number;
  ratingAverage: number | null;
  cancellations: number;
  disputesLost: number;
  computedAt: Date;
}

export interface TrustRecomputer {
  recompute(userId: string): Promise<TrustSnapshot>;
  recomputeQuietly(userIds: string[]): Promise<void>;
}

export type RentGateMode = 'quote' | 'create';

export interface RentGate {
  /** Recomputes the renter's score and throws RENTER_RESTRICTED when the toy's deposit is too high for it. */
  assertMayRent(
    userId: string,
    toy: { _id: Types.ObjectId; depositPrice?: number | null | undefined },
    mode: RentGateMode,
  ): Promise<void>;
}

import { type ClientSession, type Types } from 'mongoose';
import { type ToyImage } from './toy-listing.ports.js';
import { type ClaimantRole, type DisputeAmounts, type Payout } from '../services/rental-pricing.js';
import { type RentalHistoryEntryDto, type RentalOrderDto } from '../types/rental-order.types.js';

/** What the dispute module needs to know about an order before opening a dispute on it. */
export interface OpenContext {
  claimantRole: ClaimantRole;
  claimantId: string;
  respondentId: string;
  orderCode: string;
}

export interface MarkDisputedParams {
  orderId: string;
  claimantRole: ClaimantRole;
  disputeId: Types.ObjectId;
  actorId: string;
  now: Date;
  evidence: { photos: ToyImage[]; description: string };
  /** Creates the Dispute inside the transaction that moves the order to DISPUTING. */
  inTransaction: (session: ClientSession) => Promise<void>;
}

export interface SettleDisputeParams {
  orderId: string;
  claimantRole: ClaimantRole;
  compensation: number;
  adminId: string;
  note: string;
  /** Closes the Dispute (recording `payout`) inside the transaction that settles the order. */
  inTransaction: (session: ClientSession, payout: Payout) => Promise<void>;
}

/** Order data for the admin case file; handover and return photos are in `order.handover` / `order.returnInfo`. */
export interface OrderCaseFile {
  order: RentalOrderDto;
  history: RentalHistoryEntryDto[];
  amounts: DisputeAmounts;
}

/** Order-side operations of a dispute; one implementation per order type. */
export interface DisputableOrders {
  orderType: 'rental_order';
  /** Reads the order, finds the actor's role, checks status and deadline; throws if not allowed. */
  assertCanOpen(actorId: string, orderId: string, now: Date): Promise<OpenContext>;
  /** Moves the order to DISPUTING; `inTransaction` (creating the Dispute) runs in the same transaction. */
  markDisputed(params: MarkDisputedParams): Promise<RentalOrderDto>;
  /** Maximum compensation for the claimant's role. */
  compensationCap(orderId: string, claimantRole: ClaimantRole): Promise<number>;
  /** Splits the escrow and completes the order; `inTransaction` (closing the Dispute) runs in the same transaction. */
  settleDispute(params: SettleDisputeParams): Promise<Payout>;
  /** Order data for the admin case file. */
  caseFile(orderId: string): Promise<OrderCaseFile>;
  /** Order code shown in dispute notifications. */
  orderCode(orderId: string): Promise<string>;
}

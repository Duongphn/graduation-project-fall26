import { type DisputeReason, type DisputeStatus, type DisputeVerdict } from '../constants/dispute.js';
import { type OrderCaseFile } from '../interfaces/dispute.ports.js';
import { type IDispute } from '../models/dispute.model.js';
import { type RentalPhoto } from '../models/rental-order.model.js';
import { type ClaimantRole } from './rental-pricing.js';

export interface DisputeDto {
  id: string;
  code: string;
  orderType: string;
  orderId: string;
  claimantId: string;
  respondentId: string;
  claimantRole: ClaimantRole;
  reason: DisputeReason;
  description: string;
  evidencePhotos: RentalPhoto[];
  status: DisputeStatus;
  openedAt: Date;
  responseDueAt?: Date | undefined;
  response?: { message: string; photos: RentalPhoto[]; respondedAt: Date } | undefined;
  reviewStartedAt?: Date | undefined;
  responseMissed?: boolean | undefined;
  resolution?:
    | {
        verdict: DisputeVerdict;
        compensation: number;
        reason: string;
        resolvedAt: Date;
        payout: { renter: number; owner: number };
      }
    | undefined;
}

export type AdminDisputeDto = Omit<DisputeDto, 'resolution'> & {
  resolution?:
    | (Omit<NonNullable<DisputeDto['resolution']>, 'payout'> & {
        payout: { renter: number; owner: number; platform: number };
      })
    | undefined;
};

/** A party of the dispute, as `renter` in `RentalOrderDetailDto`. */
export interface PartyDto {
  id: string;
  fullName: string;
  avatar?: string | undefined;
  trustScore?: number | undefined;
  verified: boolean;
}

export interface AdminDisputeCaseDto {
  dispute: AdminDisputeDto;
  claimant: PartyDto;
  respondent: PartyDto;
  caseFile: OrderCaseFile;
  compensationCap: number;
  /** Chat and AI assessment are not built yet; never faked. */
  conversation: null;
  aiAssessment: null;
}

function baseDto(doc: IDispute) {
  return {
    id: doc._id.toString(),
    code: doc.code,
    orderType: doc.orderType,
    orderId: doc.orderId.toString(),
    claimantId: doc.claimantId.toString(),
    respondentId: doc.respondentId.toString(),
    claimantRole: doc.claimantRole,
    reason: doc.reason as DisputeReason,
    description: doc.description,
    evidencePhotos: doc.evidencePhotos ?? [],
    status: doc.status,
    openedAt: doc.openedAt,
    responseDueAt: doc.timer?.dueAt ?? undefined,
    response: doc.response
      ? {
          message: doc.response.message,
          photos: doc.response.photos ?? [],
          respondedAt: doc.response.respondedAt,
        }
      : undefined,
    reviewStartedAt: doc.reviewStartedAt ?? undefined,
    responseMissed: doc.responseMissed ?? undefined,
  };
}

/** Maps a dispute for one of the parties; the platform share of the payout is never exposed. */
export function toDisputeDto(doc: IDispute, viewerId: string): DisputeDto {
  void viewerId; // reserved: both parties currently see the same fields
  const r = doc.resolution;
  return {
    ...baseDto(doc),
    resolution: r
      ? {
          verdict: r.verdict,
          compensation: r.compensation,
          reason: r.reason,
          resolvedAt: r.resolvedAt,
          payout: { renter: r.payout.renter, owner: r.payout.owner },
        }
      : undefined,
  };
}

/** Admin view: same as the party view but with the full payout including the platform share. */
export function toAdminDisputeDto(doc: IDispute): AdminDisputeDto {
  const r = doc.resolution;
  return {
    ...baseDto(doc),
    resolution: r
      ? {
          verdict: r.verdict,
          compensation: r.compensation,
          reason: r.reason,
          resolvedAt: r.resolvedAt,
          payout: { renter: r.payout.renter, owner: r.payout.owner, platform: r.payout.platform },
        }
      : undefined,
  };
}

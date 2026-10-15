import type { DonationStatus, ToyStatus } from '../../shared/domain/statuses.js';
import type { DonationRecord } from './donation_requests.repository.js';

// Pure rules of the donation flow (FE-02, BF-04): who may do what, and what happens to the toy.

/** The caller of a use case. Admins act through the /admin routes only. */
export interface DonationActor {
  userId: string;
  isAdmin: boolean;
  ipAddress?: string;
}

const same = (id: unknown, userId: string) =>
  id !== undefined && id !== null && String(id) === userId;

export const isDonor = (record: DonationRecord, actor: DonationActor) =>
  same(record.donorId, actor.userId);

export const isRequester = (record: DonationRecord, actor: DonationActor) =>
  same(record.requestedBy, actor.userId);

/** May see the request at all (others get 404, so ids reveal nothing). */
export const canView = (record: DonationRecord, actor: DonationActor) =>
  actor.isAdmin || isDonor(record, actor) || isRequester(record, actor);

/**
 * D-04: only the Donor accepts or rejects (user routes). An Admin passes this check on the admin
 * routes, but `assertNotAdminDecision` then refuses a PENDING decision (409
 * DONOR_DECISION_REQUIRED): Admins only resolve stuck ACCEPTED/SHIPPING requests.
 */
export const canDecide = (record: DonationRecord, actor: DonationActor) =>
  actor.isAdmin || isDonor(record, actor);

/** D-03: the two parties see each other's contact only while the toy is being handed over. */
export const CONTACT_SHARING_STATUSES: readonly DonationStatus[] = ['ACCEPTED', 'SHIPPING'];

/**
 * Whose contact the viewer may see on this request: the Donor sees the receiver (the requesting
 * user, or the organization), the requesting USER sees the Donor. Admin views keep their own
 * (masked) contacts, so this is for user views only.
 */
export const counterpartOf = (
  record: DonationRecord,
  viewerId: string | undefined,
): 'DONOR' | 'REQUESTER' | 'ORGANIZATION' | null => {
  if (!viewerId || !CONTACT_SHARING_STATUSES.includes(record.status)) return null;
  if (same(record.donorId, viewerId)) {
    return record.receiverType === 'ORGANIZATION' ? 'ORGANIZATION' : 'REQUESTER';
  }
  if (record.receiverType === 'USER' && same(record.requestedBy, viewerId)) return 'DONOR';
  return null;
};

/**
 * The requester side of a request. For an ORGANIZATION request that is the Admin team (the
 * Admin in requestedBy only filed it), so it acts through the /admin routes, always audited.
 */
const isRequesterSide = (record: DonationRecord, actor: DonationActor) =>
  record.receiverType === 'ORGANIZATION' ? actor.isAdmin : isRequester(record, actor);

/** Before handover: the requester side, the Donor or an Admin. */
export const canCancel = (record: DonationRecord, actor: DonationActor) =>
  actor.isAdmin || isDonor(record, actor) || isRequesterSide(record, actor);

/** Users cancel before handover only; an Admin may also cancel a stuck SHIPPING request. */
export const cancellableFrom = (actor: DonationActor): readonly DonationStatus[] =>
  actor.isAdmin ? ['PENDING', 'ACCEPTED', 'SHIPPING'] : ['PENDING', 'ACCEPTED'];

/** Only the Donor hands the toy over. */
export const canHandOver = (record: DonationRecord, actor: DonationActor) =>
  !actor.isAdmin && isDonor(record, actor);

/**
 * The receiving user, or an Admin: for an organization, or for a USER receiver who never
 * confirms (then with a reason, checked by the admin service).
 */
export const canConfirmReceipt = (record: DonationRecord, actor: DonationActor) =>
  actor.isAdmin || (record.receiverType === 'USER' && isRequester(record, actor));

/** The move of the toy that goes with a request move (toyTransitions), if any. */
export const toyMoveFor = (
  from: DonationStatus,
  to: DonationStatus,
): { from: ToyStatus; to: ToyStatus } | undefined => {
  if (to === 'ACCEPTED') return { from: 'ACTIVE', to: 'RESERVED' };
  if (to === 'CANCELLED' && (from === 'ACCEPTED' || from === 'SHIPPING')) {
    return { from: 'RESERVED', to: 'ACTIVE' };
  }
  if (to === 'COMPLETED') return { from: 'RESERVED', to: 'DONATED' };
  return undefined;
};

/** Audit action of an Admin move ("area.verb"). */
export const auditActionFor = (to: DonationStatus) =>
  (
    ({
      PENDING: 'donation.create',
      ACCEPTED: 'donation.accept',
      REJECTED: 'donation.reject',
      CANCELLED: 'donation.cancel',
      SHIPPING: 'donation.hand_over',
      COMPLETED: 'donation.confirm_received',
    }) as const
  )[to];

export const SIBLING_REJECT_REASON = 'Đồ chơi đã được tặng cho người khác.';

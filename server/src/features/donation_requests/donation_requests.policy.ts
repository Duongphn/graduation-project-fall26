import type { StoredDonationStatus } from './donation_requests.model.js';
import type { DonationRecord } from './donation_requests.repository.js';

// Pure rules of the donation flow (FE-02, BF-04): who may do what, and what happens to the toy.
// Status values are the ones develop's donation_requests model stores (lowercase).

export type DonationReceiverType = 'USER' | 'ORGANIZATION';

/** Stored toy statuses of develop's toys model. A donated / reserved toy is 'hidden'. */
export type ToyStatus = 'pending' | 'active' | 'hidden';

/** The caller of a use case. Admins act through the /admin routes only. */
export interface DonationActor {
  userId: string;
  isAdmin: boolean;
  ipAddress?: string;
}

const same = (id: unknown, userId: string) =>
  id !== undefined && id !== null && String(id) === userId;

/** USER when the request names a receiving user, ORGANIZATION when it names an organization. */
export const receiverTypeOf = (record: Pick<DonationRecord, 'receiver'>): DonationReceiverType =>
  record.receiver?.organizationId ? 'ORGANIZATION' : 'USER';

export const isDonor = (record: DonationRecord, actor: DonationActor) =>
  same(record.donorId, actor.userId);

export const isRequester = (record: DonationRecord, actor: DonationActor) =>
  same(record.requestedBy, actor.userId);

/** May see the request at all (others get 404, so ids reveal nothing). */
export const canView = (record: DonationRecord, actor: DonationActor) =>
  actor.isAdmin || isDonor(record, actor) || isRequester(record, actor);

/**
 * D-04: only the Donor accepts or rejects (user routes). An Admin passes this check on the admin
 * routes, but `assertNotAdminDecision` then refuses a pending decision (409
 * DONOR_DECISION_REQUIRED): Admins only resolve stuck accepted/shipping requests.
 */
export const canDecide = (record: DonationRecord, actor: DonationActor) =>
  actor.isAdmin || isDonor(record, actor);

/** D-03: the two parties see each other's contact only while the toy is being handed over. */
export const CONTACT_SHARING_STATUSES: readonly StoredDonationStatus[] = ['accepted', 'shipping'];

/**
 * Whose contact the viewer may see on this request: the Donor sees the receiver (the requesting
 * user, or the organization), the requesting USER sees the Donor.
 */
export const counterpartOf = (
  record: DonationRecord,
  viewerId: string | undefined,
): 'DONOR' | 'REQUESTER' | 'ORGANIZATION' | null => {
  if (!viewerId || !CONTACT_SHARING_STATUSES.includes(record.status)) return null;
  const receiverType = receiverTypeOf(record);
  if (same(record.donorId, viewerId)) {
    return receiverType === 'ORGANIZATION' ? 'ORGANIZATION' : 'REQUESTER';
  }
  if (receiverType === 'USER' && same(record.requestedBy, viewerId)) return 'DONOR';
  return null;
};

/** The requester side: for an ORGANIZATION request that is the Admin team (/admin routes). */
const isRequesterSide = (record: DonationRecord, actor: DonationActor) =>
  receiverTypeOf(record) === 'ORGANIZATION' ? actor.isAdmin : isRequester(record, actor);

/** Before handover: the requester side, the Donor or an Admin. */
export const canCancel = (record: DonationRecord, actor: DonationActor) =>
  actor.isAdmin || isDonor(record, actor) || isRequesterSide(record, actor);

/** Users cancel before handover only; an Admin may also cancel a stuck shipping request. */
export const cancellableFrom = (actor: DonationActor): readonly StoredDonationStatus[] =>
  actor.isAdmin ? ['pending', 'accepted', 'shipping'] : ['pending', 'accepted'];

/** Only the Donor hands the toy over. */
export const canHandOver = (record: DonationRecord, actor: DonationActor) =>
  !actor.isAdmin && isDonor(record, actor);

/** The receiving user, or an Admin (for an organization, or a USER receiver who never confirms). */
export const canConfirmReceipt = (record: DonationRecord, actor: DonationActor) =>
  actor.isAdmin || (receiverTypeOf(record) === 'USER' && isRequester(record, actor));

/**
 * The move of the toy that goes with a request move, if any. Develop's toys have no
 * reserved/donated statuses: an accepted toy is 'hidden' (off the catalog) and stays hidden once
 * donated; a cancelled accepted/shipping request puts it back to 'active'.
 */
export const toyMoveFor = (
  from: StoredDonationStatus,
  to: StoredDonationStatus,
): { from: ToyStatus; to: ToyStatus } | undefined => {
  if (to === 'accepted') return { from: 'active', to: 'hidden' };
  if (to === 'cancelled' && (from === 'accepted' || from === 'shipping')) {
    return { from: 'hidden', to: 'active' };
  }
  return undefined;
};

/** Audit action of an Admin move ("area.verb"). */
export const auditActionFor = (to: StoredDonationStatus) =>
  (
    ({
      pending: 'donation.create',
      accepted: 'donation.accept',
      rejected: 'donation.reject',
      cancelled: 'donation.cancel',
      shipping: 'donation.hand_over',
      received: 'donation.confirm_received',
      completed: 'donation.confirm_received',
    }) as const
  )[to];

export const SIBLING_REJECT_REASON = 'Đồ chơi đã được tặng cho người khác.';

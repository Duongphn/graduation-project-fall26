import { buildPrivateImageUrl } from '../../infrastructure/storage/cloudinary.js';
import { toIsoString } from '../../shared/utils/dates.js';
import { maskPhone } from '../../shared/utils/phone.js';
import { maskEmail } from '../../shared/utils/privacy.js';
import { counterpartOf, receiverTypeOf } from './donation_requests.policy.js';
import type { DonationRecord, Relations } from './donation_requests.repository.js';

/** Who reads the DTO: Admin views get masked contacts, user views the D-03 counterpart. */
export interface DonationView {
  admin: boolean;
  viewerId?: string;
}

// Database documents -> API DTOs. Handover photos are private: stored as "<publicId>.<format>"
// (handovers.photos is a string array) and returned only as 5-minute signed links.

/** "toyflow/handovers/abc" + "jpg" -> "toyflow/handovers/abc.jpg" */
export const encodePhoto = (photo: { publicId: string; format: string }): string =>
  `${photo.publicId}.${photo.format.toLowerCase()}`;

const signedPhotoUrl = (stored: string): string | null => {
  const dot = stored.lastIndexOf('.');
  if (dot <= 0) return null;
  return (
    buildPrivateImageUrl({ publicId: stored.slice(0, dot), format: stored.slice(dot + 1) })?.url ??
    null
  );
};

const iso = (date: Date | null | undefined): string | null => toIsoString(date);

const person = (relations: Relations, id: unknown, withContacts: boolean) => {
  const user = id ? relations.users.get(String(id)) : undefined;
  if (!user) return null;
  const base = { id: String(user._id), fullName: user.fullName, avatarUrl: user.avatar ?? null };
  return withContacts
    ? { ...base, phone: maskPhone(user.phone), email: maskEmail(user.email) }
    : base;
};

const organization = (relations: Relations, id: unknown, withContacts: boolean) => {
  const org = id ? relations.organizations.get(String(id)) : undefined;
  if (!org) return null;
  const base = { id: String(org._id), name: org.name, status: org.status };
  return withContacts
    ? {
        ...base,
        address: org.address,
        contactInfo: org.contact_info,
        supportCriteria: org.support_criteria,
      }
    : base;
};

/** D-03: full name and full phone (no email) of the other party while ACCEPTED or SHIPPING. */
const counterpartContact = (record: DonationRecord, relations: Relations, view: DonationView) => {
  if (view.admin) return null;
  const side = counterpartOf(record, view.viewerId);
  if (side === 'ORGANIZATION') {
    const org = relations.organizations.get(String(record.receiver?.organizationId));
    return org ? { name: org.name, phone: org.contact_info ?? null } : null;
  }
  if (side === null) return null;
  const user = relations.users.get(String(side === 'DONOR' ? record.donorId : record.requestedBy));
  return user ? { name: user.fullName, phone: user.phone ?? null } : null;
};

export const toDonationRequestDto = (
  record: DonationRecord,
  relations: Relations,
  view: DonationView = { admin: false },
) => {
  const withContacts = view.admin;
  const toy = relations.toys.get(String(record.toyId));
  return {
    id: String(record._id),
    code: record.code,
    status: record.status,
    receiverType: receiverTypeOf(record),
    message: record.itemDetails ?? null,
    deliveryMethod: record.deliveryMethod,
    dueAt: iso(record.timer?.dueAt),
    toy: toy
      ? {
          id: String(toy._id),
          title: toy.title,
          imageUrl: toy.images[0]?.url ?? null,
          condition: toy.condition,
          ageRange: toy.ageRange ?? null,
          status: toy.status,
        }
      : null,
    donor: person(relations, record.donorId, withContacts),
    requester: person(relations, record.requestedBy, withContacts),
    organization: organization(relations, record.receiver?.organizationId, withContacts),
    counterpartContact: counterpartContact(record, relations, view),
    decidedAt: iso(record.decidedAt),
    rejectReason: record.rejectReason ?? null,
    completedAt: iso(record.completedAt),
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
};

/**
 * The status timeline, rebuilt from the request's own fields (develop's donation_requests keeps
 * no separate history): created, decided, handed over, completed or cancelled.
 */
const historyOf = (record: DonationRecord) => {
  type Row = {
    fromStatus: string | null;
    toStatus: string;
    actorType: string;
    actorId: string | null;
    reason: string | null;
    at: string;
  };
  const rows: Row[] = [
    {
      fromStatus: null,
      toStatus: 'pending',
      actorType: 'USER',
      actorId: String(record.requestedBy),
      reason: null,
      at: iso(record.createdAt)!,
    },
  ];
  let last = 'pending';
  const push = (toStatus: string, at: Date | undefined, actorId: unknown, reason?: string) => {
    if (!at) return;
    rows.push({
      fromStatus: last,
      toStatus,
      actorType: actorId ? 'USER' : 'SYSTEM',
      actorId: actorId ? String(actorId) : null,
      reason: reason ?? null,
      at: iso(at)!,
    });
    last = toStatus;
  };
  if (record.decidedAt) {
    const accepted = record.status !== 'rejected';
    push(
      accepted ? 'accepted' : 'rejected',
      record.decidedAt,
      record.decidedBy,
      record.rejectReason,
    );
  }
  const sent = record.handovers?.find((handover) => handover.step === 'DONOR_SENT');
  if (sent) push('shipping', sent.at, sent.by, sent.note);
  const received = record.handovers?.find((handover) => handover.step === 'RECEIVER_RECEIVED');
  if (record.completedAt) push('completed', record.completedAt, received?.by);
  if (record.cancellation) {
    rows.push({
      fromStatus: last,
      toStatus: 'cancelled',
      actorType: record.cancellation.actorType,
      actorId: record.cancellation.by ? String(record.cancellation.by) : null,
      reason: record.cancellation.note ?? record.cancellation.reason,
      at: iso(record.cancellation.at)!,
    });
  }
  return rows;
};

export const toDonationRequestDetailDto = (
  record: DonationRecord,
  relations: Relations,
  view: DonationView = { admin: false },
) => ({
  ...toDonationRequestDto(record, relations, view),
  decidedBy: record.decidedBy ? String(record.decidedBy) : null,
  handovers: record.handovers.map((handover) => ({
    step: handover.step as 'DONOR_SENT' | 'RECEIVER_RECEIVED',
    by: String(handover.by),
    photos: handover.photos.map(signedPhotoUrl),
    note: handover.note ?? null,
    at: iso(handover.at)!,
  })),
  cancellation: record.cancellation
    ? {
        reason: record.cancellation.reason,
        actorType: record.cancellation.actorType,
        by: record.cancellation.by ? String(record.cancellation.by) : null,
        note: record.cancellation.note ?? null,
        at: iso(record.cancellation.at)!,
      }
    : null,
  history: historyOf(record),
});

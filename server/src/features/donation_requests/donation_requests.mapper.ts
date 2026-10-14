import { buildPrivateImageUrl } from '../../infrastructure/storage/cloudinary.js';
import { toIsoString } from '../../shared/utils/dates.js';
import { maskPhone } from '../../shared/utils/phone.js';
import { maskEmail } from '../../shared/utils/privacy.js';
import type { DonationRecord, findHistory, Relations } from './donation_requests.repository.js';

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
  const base = { id: String(user._id), fullName: user.fullName, avatarUrl: user.avatarUrl ?? null };
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
        contactInfo: org.contactInfo,
        phone: org.phone ?? null,
        logoUrl: org.logoUrl ?? null,
      }
    : base;
};

export const toDonationRequestDto = (
  record: DonationRecord,
  relations: Relations,
  withContacts = false,
) => {
  const toy = relations.toys.get(String(record.toyId));
  return {
    id: String(record._id),
    code: record.code,
    status: record.status,
    receiverType: record.receiverType,
    message: record.message ?? null,
    toy: toy
      ? {
          id: String(toy._id),
          title: toy.title,
          imageUrl: toy.images[0] ?? null,
          condition: toy.condition,
          ageGroup: toy.ageGroup,
          status: toy.status,
        }
      : null,
    donor: person(relations, record.donorId, withContacts),
    requester: person(relations, record.requestedBy, withContacts),
    organization: organization(relations, record.organizationId, withContacts),
    decidedAt: iso(record.decidedAt),
    rejectReason: record.rejectReason ?? null,
    completedAt: iso(record.completedAt),
    createdAt: iso(record.createdAt)!,
    updatedAt: iso(record.updatedAt)!,
  };
};

export const toDonationRequestDetailDto = (
  record: DonationRecord,
  relations: Relations,
  history: Awaited<ReturnType<typeof findHistory>>,
  withContacts = false,
) => ({
  ...toDonationRequestDto(record, relations, withContacts),
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
  history: history.map((row) => ({
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus,
    actorType: row.actor?.type ?? 'SYSTEM',
    actorId: row.actor?.userId ? String(row.actor.userId) : null,
    reason: row.reason ?? null,
    at: iso(row.createdAt)!,
  })),
});

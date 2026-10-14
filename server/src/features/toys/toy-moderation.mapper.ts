import { ageInYears, toIsoString } from '../../shared/utils/dates.js';
import { maskPhone } from '../../shared/utils/phone.js';
import type * as repository from './toy-moderation.repository.js';
import type { ToyModerationDetail, ToyModerationListItem } from './toy-moderation.schemas.js';

// Database documents -> response DTOs of the Admin moderation screens. Phones are masked (GB-35).

export type QueueToy = Awaited<ReturnType<typeof repository.findQueueToys>>[number];
export type CategoryRow = Awaited<ReturnType<typeof repository.findCategoriesByIds>>[number];
export type OwnerRow = Awaited<ReturnType<typeof repository.findOwnersByIds>>[number];

const iso = (date: Date | null | undefined): string => toIsoString(date) ?? '';

/** A permanent or a running temporary lock (users.lock.until). */
export const isLocked = (owner: Pick<OwnerRow, 'status' | 'lock'>, now: Date): boolean =>
  owner.status === 'LOCKED' || (owner.lock?.until ? owner.lock.until > now : false);

export const ownerAge = (owner: OwnerRow, now: Date): number | null =>
  owner.dateOfBirth ? ageInYears(owner.dateOfBirth, now) : null;

const toCategory = (category: CategoryRow | null | undefined) =>
  category ? { id: String(category._id), name: category.name, status: category.status } : null;

const toOwnerSummary = (owner: OwnerRow) => ({
  id: String(owner._id),
  fullName: owner.fullName,
  maskedPhone: maskPhone(owner.phone),
  identityStatus: owner.identityStatus,
});

export const toListItem = (
  toy: QueueToy,
  category: CategoryRow | null | undefined,
  owner: OwnerRow | null | undefined,
): ToyModerationListItem => ({
  id: String(toy._id),
  title: toy.title,
  listingType: toy.listingType,
  status: toy.status,
  condition: toy.condition,
  ageGroup: toy.ageGroup,
  pricing: {
    rentPerDay: toy.pricing?.rentPerDay ?? null,
    deposit: toy.pricing?.deposit ?? null,
    salePrice: toy.pricing?.salePrice ?? null,
  },
  area: toy.area ?? null,
  coverImage: toy.images[0] ?? null,
  imageCount: toy.images.length,
  category: toCategory(category),
  owner: owner ? toOwnerSummary(owner) : null,
  moderation: {
    submittedAt: iso(toy.moderation?.submittedAt ?? toy.createdAt),
    rejectReason: toy.moderation?.rejectReason ?? null,
  },
  createdAt: iso(toy.createdAt),
  updatedAt: iso(toy.updatedAt),
});

export const toDetailOwner = (
  owner: OwnerRow,
  now: Date,
): NonNullable<ToyModerationDetail['owner']> => {
  const ratingCount = owner.trust?.ratingCount ?? 0;
  return {
    ...toOwnerSummary(owner),
    accountStatus: isLocked(owner, now) ? 'LOCKED' : 'ACTIVE',
    lockedUntil: owner.lock?.until && owner.lock.until > now ? iso(owner.lock.until) : null,
    age: ownerAge(owner, now),
    trustScore: ratingCount > 0 ? (owner.trust?.ratingSum ?? 0) / ratingCount : null,
    ratingCount,
    memberSince: iso(owner.createdAt),
  };
};

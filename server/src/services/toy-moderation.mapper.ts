import { toIsoString } from '../utils/dates.js';
import { maskPhone } from '../utils/phone.js';
import type { CategoryRow, OwnerRow, ToyRow } from '../repositories/toy-moderation.repository.js';
import type { ToyModerationDetail, ToyModerationListItem } from '../validations/toy-moderation.validation.js';

// Database documents -> response DTOs of the Admin moderation screens. Phones are masked.

export type { CategoryRow, OwnerRow } from '../repositories/toy-moderation.repository.js';

const iso = (date: Date | null | undefined): string => toIsoString(date) ?? '';

/** A permanent or a running temporary lock (users.lock.until). */
export const isLocked = (owner: Pick<OwnerRow, 'status' | 'lock'>, now: Date): boolean =>
  owner.status === 'LOCKED' || (owner.lock?.until ? owner.lock.until > now : false);

/** Category status as stored by develop ('active' by default), reported lowercase. */
export const categoryStatus = (status: string): 'active' | 'hidden' =>
  status.toLowerCase() === 'active' ? 'active' : 'hidden';

const toCategory = (category: CategoryRow | null | undefined) =>
  category
    ? { id: String(category._id), name: category.name, status: categoryStatus(category.status) }
    : null;

const toOwnerSummary = (owner: OwnerRow) => ({
  id: String(owner._id),
  fullName: owner.fullName,
  maskedPhone: maskPhone(owner.phone),
  verificationStatus: owner.verificationStatus,
});

export const toListItem = (
  toy: ToyRow,
  category: CategoryRow | null | undefined,
  owner: OwnerRow | null | undefined,
): ToyModerationListItem => ({
  id: String(toy._id),
  title: toy.title,
  listingType: toy.listingType,
  status: toy.status,
  condition: toy.condition,
  ageRange: { minAge: toy.ageRange.minAge, maxAge: toy.ageRange.maxAge },
  priceOrRate: toy.priceOrRate,
  depositPrice: toy.listingType === 'rent' ? (toy.depositPrice ?? null) : null,
  coverImage: toy.images[0]?.url ?? null,
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
): NonNullable<ToyModerationDetail['owner']> => ({
  ...toOwnerSummary(owner),
  accountStatus: isLocked(owner, now) ? 'LOCKED' : 'ACTIVE',
  lockedUntil: owner.lock?.until && owner.lock.until > now ? iso(owner.lock.until) : null,
  trustScore: owner.trust?.score ?? null,
  memberSince: iso(owner.createdAt),
});

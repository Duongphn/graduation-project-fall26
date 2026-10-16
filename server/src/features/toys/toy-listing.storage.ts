import type { AgeGroup, ToyCondition } from '../../shared/domain/enums.js';
import type { ToyStatus } from '../../shared/domain/statuses.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { IToy } from './toys.model.js';
import type {
  ListingFilterStatus,
  ListingType,
  StoredListingStatus,
  ToyAgeRange,
  ToyImage,
} from './toy-listing.ports.js';

// Translates between the toy listing API (UC04: rent/sell, priceOrRate, depositPrice, ageRange,
// free-text condition labels, images with publicId) and the shared toys schema (RENT/SALE,
// pricing, ageGroup, condition enum, images + imagePublicIds, upper-case statuses).

const STORED_LISTING_TYPE = { rent: 'RENT', sell: 'SALE' } as const;

export const toStoredListingType = (type: ListingType): 'RENT' | 'SALE' =>
  STORED_LISTING_TYPE[type];

export const fromStoredListingType = (type: string): ListingType =>
  type === 'RENT' ? 'rent' : 'sell';

const STORED_STATUS: Record<StoredListingStatus, ToyStatus> = {
  pending: 'PENDING_REVIEW',
  active: 'ACTIVE',
  hidden: 'HIDDEN',
};

export const toStoredStatus = (status: StoredListingStatus): ToyStatus => STORED_STATUS[status];

/** Status shown to the owner. Statuses outside the UC04 set are folded into the closest one. */
export const fromStoredStatus = (status: string): ListingFilterStatus => {
  switch (status) {
    case 'ACTIVE':
    case 'RESERVED':
      return 'active';
    case 'SOLD':
    case 'DONATED':
      return 'sold';
    case 'HIDDEN':
    case 'REJECTED':
      return 'hidden';
    default:
      return 'pending';
  }
};

/** Labels offered by the listing form (Frontend toy-listing-schema.ts CONDITION_OPTIONS). */
const CONDITION_LABELS: Record<ToyCondition, string> = {
  NEW: 'Mới',
  LIKE_NEW: 'Như mới (90–99%)',
  GOOD: 'Tốt (70–89%)',
  FAIR: 'Cũ nhiều',
};

export const toStoredCondition = (condition: string): ToyCondition => {
  const trimmed = condition.trim();
  const byLabel = (Object.keys(CONDITION_LABELS) as ToyCondition[]).find(
    (key) => CONDITION_LABELS[key] === trimmed,
  );
  if (byLabel) return byLabel;
  const byKey = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
  if (byKey in CONDITION_LABELS) return byKey as ToyCondition;
  throw new AppError(
    400,
    'VALIDATION_ERROR',
    `condition must be one of: ${Object.values(CONDITION_LABELS).join(', ')}.`,
  );
};

export const fromStoredCondition = (condition: string): string =>
  CONDITION_LABELS[condition as ToyCondition] ?? condition;

export const toAgeGroup = ({ minAge }: ToyAgeRange): AgeGroup => {
  if (minAge <= 2) return 'AGE_0_2';
  if (minAge <= 5) return 'AGE_3_5';
  if (minAge <= 8) return 'AGE_6_8';
  if (minAge <= 12) return 'AGE_9_12';
  return 'AGE_13_PLUS';
};

const AGE_GROUP_RANGES: Record<AgeGroup, ToyAgeRange> = {
  AGE_0_2: { minAge: 0, maxAge: 2 },
  AGE_3_5: { minAge: 3, maxAge: 5 },
  AGE_6_8: { minAge: 6, maxAge: 8 },
  AGE_9_12: { minAge: 9, maxAge: 12 },
  AGE_13_PLUS: { minAge: 13, maxAge: 99 },
};

export const toStoredPricing = (
  type: ListingType,
  priceOrRate: number,
  depositPrice: number | undefined,
): NonNullable<IToy['pricing']> =>
  type === 'rent'
    ? { rentPerDay: priceOrRate, deposit: depositPrice ?? null }
    : { salePrice: priceOrRate };

type StoredToy = Pick<
  IToy,
  | 'listingType'
  | 'pricing'
  | 'images'
  | 'imagePublicIds'
  | 'ageRange'
  | 'ageGroup'
  | 'condition'
>;

export const storedPrice = (toy: Pick<IToy, 'listingType' | 'pricing'>): number =>
  (toy.listingType === 'RENT' ? toy.pricing?.rentPerDay : toy.pricing?.salePrice) ?? 0;

export const storedDeposit = (toy: Pick<IToy, 'listingType' | 'pricing'>): number | undefined =>
  toy.listingType === 'RENT' ? (toy.pricing?.deposit ?? undefined) : undefined;

export const storedImages = (toy: Pick<IToy, 'images' | 'imagePublicIds'>): ToyImage[] =>
  (toy.images ?? []).map((url, index) => ({ url, publicId: toy.imagePublicIds?.[index] ?? '' }));

export const storedAgeRange = (toy: Pick<IToy, 'ageRange' | 'ageGroup'>): ToyAgeRange =>
  toy.ageRange
    ? { minAge: toy.ageRange.minAge, maxAge: toy.ageRange.maxAge }
    : AGE_GROUP_RANGES[toy.ageGroup];

export const toListingFields = (toy: StoredToy) => {
  const deposit = storedDeposit(toy);
  return {
    condition: fromStoredCondition(toy.condition),
    listingType: fromStoredListingType(toy.listingType),
    priceOrRate: storedPrice(toy),
    ...(deposit !== undefined ? { depositPrice: deposit } : {}),
    ageRange: storedAgeRange(toy),
    images: storedImages(toy),
  };
};

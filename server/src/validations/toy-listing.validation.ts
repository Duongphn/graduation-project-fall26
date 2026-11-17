import { AppError } from '../utils/app-error.js';
import type { ListingType, ToyAgeRange } from '../interfaces/toy-listing.ports.js';

export interface CreateToyListingInput {
  title: string;
  description: string;
  condition: string;
  categoryId: string;
  listingType: ListingType;
  priceOrRate: number;
  depositPrice?: number;
  ageRange: ToyAgeRange;
  quantity?: number;
}

export interface UpdateToyListingInput {
  title?: string;
  description?: string;
  condition?: string;
  categoryId?: string;
  listingType?: ListingType;
  priceOrRate?: number;
  depositPrice?: number;
  ageRange?: ToyAgeRange;
}

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

/**
 * Field rules of the Post Rental Listing and Post Resale Listing screens (R03 III.3.1.1 (5), (9),
 * (11), (12); III.3.1.2 (6), (10), (12); R04 toys). Only rent and sale listings use them:
 * POST /donation-posts shares validateCreateToyListingInput, which does not check them.
 */
export const LISTING_FIELD_RULES = {
  titleMax: 100,
  descriptionMin: 50,
  descriptionMax: 1000,
  rentPricePerDay: { min: 5_000, max: 5_000_000 },
  salePrice: { min: 10_000, max: 50_000_000 },
} as const;

const fieldError = (field: string, message: string) =>
  new AppError(400, 'VALIDATION_ERROR', message, { field });

/**
 * Checks the fields of a rent or sale listing that are set: on create all of them, on an edit the
 * ones it sends, with the stored values for the others (deposit against the daily price).
 */
export function assertListingFieldRules(listing: {
  title?: string | undefined;
  description?: string | undefined;
  listingType: ListingType;
  priceOrRate?: number | undefined;
  depositPrice?: number | undefined;
}): void {
  const rules = LISTING_FIELD_RULES;
  if (listing.title !== undefined && listing.title.length > rules.titleMax) {
    throw fieldError('title', `title: please enter no more than ${rules.titleMax} characters.`);
  }
  if (
    listing.description !== undefined &&
    (listing.description.length < rules.descriptionMin ||
      listing.description.length > rules.descriptionMax)
  ) {
    throw fieldError(
      'description',
      `description must be between ${rules.descriptionMin} and ${rules.descriptionMax} characters.`,
    );
  }
  if (listing.priceOrRate !== undefined) {
    const range = listing.listingType === 'rent' ? rules.rentPricePerDay : rules.salePrice;
    if (!Number.isInteger(listing.priceOrRate)) {
      throw fieldError('priceOrRate', 'priceOrRate must be a whole number of VND.');
    }
    if (listing.priceOrRate < range.min || listing.priceOrRate > range.max) {
      throw fieldError(
        'priceOrRate',
        `priceOrRate must be between ${range.min} and ${range.max}.`,
      );
    }
  }
  if (listing.listingType === 'rent' && listing.depositPrice !== undefined) {
    if (!Number.isInteger(listing.depositPrice)) {
      throw fieldError('depositPrice', 'depositPrice must be a whole number of VND.');
    }
    if (listing.priceOrRate !== undefined && listing.depositPrice < listing.priceOrRate) {
      throw fieldError(
        'depositPrice',
        'depositPrice must be at least one day of rental (priceOrRate).',
      );
    }
  }
}

/**
 * Photos per listing type (R03 GB-10, III.3.1.1 (1)-(2), III.3.1.2 (3)-(4); R04 toys.images).
 * Donation posts are created by POST /donation-posts; their limit applies when one is edited here.
 */
export const LISTING_PHOTO_LIMITS = {
  rent: { min: 3, max: 8 },
  sell: { min: 4, max: 8 },
  donate: { min: 3, max: 10 },
} as const;

/** Refuses a photo count outside GB-10 for the listing type, with MSG21 for too few photos. */
export function assertListingPhotoCount(
  listingType: keyof typeof LISTING_PHOTO_LIMITS,
  count: number,
): void {
  const { min, max } = LISTING_PHOTO_LIMITS[listingType];
  if (count < min) {
    throw new AppError(400, 'TOO_FEW_PHOTOS', `Please upload at least ${min} photos.`, { min, max });
  }
  if (count > max) {
    throw new AppError(400, 'TOO_MANY_PHOTOS', `Please upload no more than ${max} photos.`, {
      min,
      max,
    });
  }
}

/**
 * Listing photos are JPG or PNG only (R03 GB-10, MSG20). `detectedType` is the type that
 * validateToyImage read from the file content; that shared check also takes WebP for other uploads.
 */
export function assertListingPhotoType(detectedType: string): void {
  if (detectedType !== 'image/jpeg' && detectedType !== 'image/png') {
    throw new AppError(
      400,
      'INVALID_IMAGE_FORMAT',
      'Only JPG or PNG files up to 5 MB are accepted.',
    );
  }
}

function parseNonEmptyString(val: unknown, fieldName: string): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldName} must be a non-empty string.`);
  }
  return val.trim();
}

function parseCategoryId(val: unknown): string {
  if (typeof val !== 'string' || !OBJECT_ID_REGEX.test(val.trim())) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'categoryId must be a valid 24-character hexadecimal ObjectId.',
    );
  }
  // Lower-case like ObjectId#toString() so string comparisons with stored ids are exact.
  return val.trim().toLowerCase();
}

function parseAgeRange(raw: unknown): ToyAgeRange {
  let val = raw;
  if (typeof val === 'string') {
    try {
      val = JSON.parse(val);
    } catch {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'ageRange must be a valid object with whole non-negative integers minAge and maxAge.',
      );
    }
  }

  if (!val || typeof val !== 'object' || Array.isArray(val)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'ageRange must be an object containing minAge and maxAge.',
    );
  }

  const obj = val as Record<string, unknown>;
  const minAge = typeof obj.minAge === 'string' ? Number(obj.minAge) : obj.minAge;
  const maxAge = typeof obj.maxAge === 'string' ? Number(obj.maxAge) : obj.maxAge;

  if (
    typeof minAge !== 'number' ||
    typeof maxAge !== 'number' ||
    !Number.isInteger(minAge) ||
    !Number.isInteger(maxAge) ||
    minAge < 0 ||
    maxAge < 0
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'ageRange minAge and maxAge must be whole non-negative integers.',
    );
  }

  if (minAge > maxAge) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'ageRange minAge must be less than or equal to maxAge.',
    );
  }

  return { minAge, maxAge };
}

export function validateCreateToyListingInput(raw: unknown): CreateToyListingInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Listing payload must be an object.');
  }

  const data = raw as Record<string, unknown>;

  // Disallow client-controlled actor/status fields
  if ('ownerId' in data && data.ownerId !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Field "ownerId" is not allowed in input.');
  }
  if ('owner' in data && data.owner !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Field "owner" is not allowed in input.');
  }
  if ('status' in data && data.status !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Field "status" is not allowed in input.');
  }
  if ('sold' in data && data.sold !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Field "sold" is not allowed in input.');
  }

  const title = parseNonEmptyString(data.title, 'title');
  const description = parseNonEmptyString(data.description, 'description');
  const condition = parseNonEmptyString(data.condition, 'condition');
  const categoryId = parseCategoryId(data.categoryId);

  if (data.listingType !== 'rent' && data.listingType !== 'sell') {
    throw new AppError(400, 'VALIDATION_ERROR', 'listingType must be "rent" or "sell".');
  }
  const listingType: ListingType = data.listingType;

  const rawPrice = data.priceOrRate !== undefined ? data.priceOrRate : data.price;
  if (rawPrice === undefined || rawPrice === null || rawPrice === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'priceOrRate is required.');
  }
  const parsedPrice = typeof rawPrice === 'string' ? Number(rawPrice.trim()) : Number(rawPrice);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'priceOrRate must be a positive number (> 0).');
  }

  let parsedDeposit: number | undefined;
  const rawDeposit = data.depositPrice !== undefined ? data.depositPrice : data.deposit;

  if (listingType === 'rent') {
    if (rawDeposit === undefined || rawDeposit === null || rawDeposit === '') {
      throw new AppError(400, 'VALIDATION_ERROR', 'depositPrice is required for rent listings.');
    }
    const num = typeof rawDeposit === 'string' ? Number(rawDeposit.trim()) : Number(rawDeposit);
    if (!Number.isFinite(num) || num < 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'depositPrice must be a non-negative number (>= 0) for rent listings.',
      );
    }
    parsedDeposit = num;
  } else {
    // listingType === 'sell'
    if (rawDeposit !== undefined && rawDeposit !== null && rawDeposit !== '') {
      throw new AppError(400, 'VALIDATION_ERROR', 'depositPrice is not allowed for sell listings.');
    }
    parsedDeposit = undefined;
  }

  if (data.quantity !== undefined && data.quantity !== null && data.quantity !== '') {
    const parsedQty =
      typeof data.quantity === 'string' ? Number(data.quantity.trim()) : Number(data.quantity);
    if (parsedQty !== 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Quantity must be 1.');
    }
  }

  const ageRange = parseAgeRange(data.ageRange);

  return {
    title,
    description,
    condition,
    categoryId,
    listingType,
    priceOrRate: parsedPrice,
    ...(parsedDeposit !== undefined ? { depositPrice: parsedDeposit } : {}),
    ageRange,
    quantity: 1,
  };
}

export function validateUpdateToyListingInput(raw: unknown): UpdateToyListingInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Update payload must be an object.');
  }

  const data = raw as Record<string, unknown>;

  // Disallow client-controlled actor/status/quantity fields
  if ('ownerId' in data && data.ownerId !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Field "ownerId" is not allowed in update.');
  }
  if ('owner' in data && data.owner !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Field "owner" is not allowed in update.');
  }
  if ('status' in data && data.status !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Field "status" is not allowed in update.');
  }
  if ('sold' in data && data.sold !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Field "sold" is not allowed in update.');
  }
  if ('quantity' in data && data.quantity !== undefined) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Field "quantity" cannot be updated.');
  }

  const result: UpdateToyListingInput = {};

  if (data.title !== undefined) {
    result.title = parseNonEmptyString(data.title, 'title');
  }

  if (data.description !== undefined) {
    result.description = parseNonEmptyString(data.description, 'description');
  }

  if (data.condition !== undefined) {
    result.condition = parseNonEmptyString(data.condition, 'condition');
  }

  if (data.categoryId !== undefined) {
    result.categoryId = parseCategoryId(data.categoryId);
  }

  if (data.ageRange !== undefined) {
    result.ageRange = parseAgeRange(data.ageRange);
  }

  if (data.listingType !== undefined) {
    if (data.listingType !== 'rent' && data.listingType !== 'sell') {
      throw new AppError(400, 'VALIDATION_ERROR', 'listingType must be "rent" or "sell".');
    }
    result.listingType = data.listingType;
  }

  const rawPrice = data.priceOrRate !== undefined ? data.priceOrRate : data.price;
  if (rawPrice !== undefined) {
    if (rawPrice === null || rawPrice === '') {
      throw new AppError(400, 'VALIDATION_ERROR', 'priceOrRate cannot be empty.');
    }
    const parsedPrice = typeof rawPrice === 'string' ? Number(rawPrice.trim()) : Number(rawPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'priceOrRate must be a positive number (> 0).');
    }
    result.priceOrRate = parsedPrice;
  }

  const rawDeposit = data.depositPrice !== undefined ? data.depositPrice : data.deposit;
  if (rawDeposit !== undefined) {
    if (result.listingType === 'sell') {
      throw new AppError(400, 'VALIDATION_ERROR', 'depositPrice is not allowed for sell listings.');
    }
    if (rawDeposit === null || rawDeposit === '') {
      throw new AppError(400, 'VALIDATION_ERROR', 'depositPrice cannot be empty.');
    }
    const parsedDeposit =
      typeof rawDeposit === 'string' ? Number(rawDeposit.trim()) : Number(rawDeposit);
    if (!Number.isFinite(parsedDeposit) || parsedDeposit < 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'depositPrice must be a non-negative number (>= 0).',
      );
    }
    result.depositPrice = parsedDeposit;
  }

  return result;
}

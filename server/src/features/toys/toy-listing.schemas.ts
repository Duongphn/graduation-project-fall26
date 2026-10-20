import { AppError } from '../../shared/errors/app-error.js';
import type { ListingType, ToyAgeRange } from './toy-listing.ports.js';

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

const isBlank = (value: unknown) => value === undefined || value === null || value === '';

function assertQuantityIsOne(quantity: unknown): void {
  if (isBlank(quantity)) return;
  const parsedQty = typeof quantity === 'string' ? Number(quantity.trim()) : Number(quantity);
  if (parsedQty !== 1) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Quantity must be 1.');
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
  return val.trim();
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

  if (data.listingType !== 'rent' && data.listingType !== 'sell' && data.listingType !== 'donate') {
    throw new AppError(400, 'VALIDATION_ERROR', 'listingType must be "rent", "sell" or "donate".');
  }
  const listingType: ListingType = data.listingType;

  const rawPrice = data.priceOrRate !== undefined ? data.priceOrRate : data.price;
  const rawDeposit = data.depositPrice !== undefined ? data.depositPrice : data.deposit;
  if (listingType === 'donate') {
    // FE-02: a donation post is free. A price of 0 is accepted: the service validates the
    // already validated input again (the controller validated it first, with priceOrRate 0).
    if (!(isBlank(rawPrice) || Number(rawPrice) === 0) || !isBlank(rawDeposit)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A donation post has no price or deposit.');
    }
    assertQuantityIsOne(data.quantity);
    return {
      title,
      description,
      condition,
      categoryId,
      listingType,
      priceOrRate: 0,
      ageRange: parseAgeRange(data.ageRange),
      quantity: 1,
    };
  }

  if (rawPrice === undefined || rawPrice === null || rawPrice === '') {
    throw new AppError(400, 'VALIDATION_ERROR', 'priceOrRate is required.');
  }
  const parsedPrice = typeof rawPrice === 'string' ? Number(rawPrice.trim()) : Number(rawPrice);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'priceOrRate must be a positive number (> 0).');
  }

  let parsedDeposit: number | undefined;

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

  assertQuantityIsOne(data.quantity);

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
    if (data.listingType !== 'rent' && data.listingType !== 'sell' && data.listingType !== 'donate') {
      throw new AppError(400, 'VALIDATION_ERROR', 'listingType must be "rent", "sell" or "donate".');
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

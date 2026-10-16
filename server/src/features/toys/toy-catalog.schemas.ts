import mongoose from 'mongoose';
import { AppError } from '../../shared/errors/app-error.js';
import type { ToySearchQuery } from './toy-catalog.ports.js';

const ALLOWED_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'distance'] as const;
type AllowedSort = (typeof ALLOWED_SORTS)[number];

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateToyId(raw: unknown): string {
  if (typeof raw !== 'string' || !mongoose.Types.ObjectId.isValid(raw)) {
    throw new AppError(
      400,
      'INVALID_TOY_ID',
      'Toy ID must be a valid 24-character hexadecimal ObjectId.',
    );
  }
  return raw;
}

export function validateToySearchQuery(raw: unknown): ToySearchQuery {
  if (!raw || typeof raw !== 'object') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Query parameters must be an object.');
  }

  const query = raw as Record<string, unknown>;

  // Keyword
  let q: string | undefined;
  if (query.q !== undefined && query.q !== null && query.q !== '') {
    if (typeof query.q !== 'string') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Search keyword "q" must be a string.');
    }
    const trimmed = query.q.trim();
    if (trimmed.length > 0) {
      q = trimmed;
    }
  }

  // Type
  let type: 'rent' | 'sell' | undefined;
  if (query.type !== undefined && query.type !== null && query.type !== '') {
    if (query.type !== 'rent' && query.type !== 'sell') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Listing type must be either "rent" or "sell".');
    }
    type = query.type;
  }

  // Category
  let categoryId: string | undefined;
  if (query.categoryId !== undefined && query.categoryId !== null && query.categoryId !== '') {
    if (
      typeof query.categoryId !== 'string' ||
      !mongoose.Types.ObjectId.isValid(query.categoryId)
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Category ID must be a valid 24-character hexadecimal ObjectId.',
      );
    }
    categoryId = query.categoryId;
  }

  // Age range
  let ageMin: number | undefined;
  if (query.ageMin !== undefined && query.ageMin !== null && query.ageMin !== '') {
    const parsed = Number(query.ageMin);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ageMin must be a non-negative integer.');
    }
    ageMin = parsed;
  }

  let ageMax: number | undefined;
  if (query.ageMax !== undefined && query.ageMax !== null && query.ageMax !== '') {
    const parsed = Number(query.ageMax);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'ageMax must be a non-negative integer.');
    }
    ageMax = parsed;
  }

  if (ageMin !== undefined && ageMax !== undefined && ageMin > ageMax) {
    throw new AppError(400, 'VALIDATION_ERROR', 'ageMin cannot be greater than ageMax.');
  }

  // Price range
  let minPrice: number | undefined;
  if (query.minPrice !== undefined && query.minPrice !== null && query.minPrice !== '') {
    const parsed = Number(query.minPrice);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'minPrice must be a non-negative number.');
    }
    minPrice = parsed;
  }

  let maxPrice: number | undefined;
  if (query.maxPrice !== undefined && query.maxPrice !== null && query.maxPrice !== '') {
    const parsed = Number(query.maxPrice);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'maxPrice must be a non-negative number.');
    }
    maxPrice = parsed;
  }

  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new AppError(400, 'VALIDATION_ERROR', 'minPrice cannot be greater than maxPrice.');
  }

  // Geospatial coordinates & radius
  const hasLat = query.lat !== undefined && query.lat !== null && query.lat !== '';
  const hasLng = query.lng !== undefined && query.lng !== null && query.lng !== '';
  const hasRadius =
    query.radiusKm !== undefined && query.radiusKm !== null && query.radiusKm !== '';

  let lat: number | undefined;
  let lng: number | undefined;
  let radiusKm: number | undefined;

  if (hasLat || hasLng || hasRadius) {
    if (!hasLat || !hasLng || !hasRadius) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Area search requires latitude (lat), longitude (lng), and radiusKm to be provided together.',
      );
    }

    const parsedLat = Number(query.lat);
    if (!Number.isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Latitude must be a valid number between -90 and 90.',
      );
    }
    lat = parsedLat;

    const parsedLng = Number(query.lng);
    if (!Number.isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Longitude must be a valid number between -180 and 180.',
      );
    }
    lng = parsedLng;

    const parsedRadius = Number(query.radiusKm);
    if (!Number.isFinite(parsedRadius) || parsedRadius <= 0 || parsedRadius > 100) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'radiusKm must be greater than 0 and at most 100 km.',
      );
    }
    radiusKm = parsedRadius;
  }

  // Sort
  let sort: AllowedSort;
  if (query.sort !== undefined && query.sort !== null && query.sort !== '') {
    if (typeof query.sort !== 'string' || !ALLOWED_SORTS.includes(query.sort as AllowedSort)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Invalid sort value. Allowed sorts: ${ALLOWED_SORTS.join(', ')}.`,
      );
    }
    sort = query.sort as AllowedSort;

    if (sort === 'distance' && (lat === undefined || lng === undefined)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Sorting by "distance" requires valid latitude and longitude coordinates.',
      );
    }
  } else {
    sort = q ? 'relevance' : 'newest';
  }

  // Pagination
  let page = 1;
  if (query.page !== undefined && query.page !== null && query.page !== '') {
    const parsedPage = Number(query.page);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', 'page must be a positive integer >= 1.');
    }
    page = parsedPage;
  }

  let limit = 20;
  if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
    const parsedLimit = Number(query.limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new AppError(400, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 100.');
    }
    limit = parsedLimit;
  }

  return {
    ...(q !== undefined && { q }),
    ...(type !== undefined && { type }),
    ...(categoryId !== undefined && { categoryId }),
    ...(ageMin !== undefined && { ageMin }),
    ...(ageMax !== undefined && { ageMax }),
    ...(minPrice !== undefined && { minPrice }),
    ...(maxPrice !== undefined && { maxPrice }),
    ...(lat !== undefined && { lat }),
    ...(lng !== undefined && { lng }),
    ...(radiusKm !== undefined && { radiusKm }),
    page,
    limit,
    sort,
  };
}

export function validateAvailabilityQuery(raw: unknown): { from: Date; toInclusive: Date } {
  if (!raw || typeof raw !== 'object') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Query parameters must be an object.');
  }

  const query = raw as Record<string, unknown>;

  if (typeof query.from !== 'string' || !DATE_ONLY_REGEX.test(query.from)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Parameter "from" is required and must follow YYYY-MM-DD format.',
    );
  }

  if (typeof query.to !== 'string' || !DATE_ONLY_REGEX.test(query.to)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Parameter "to" is required and must follow YYYY-MM-DD format.',
    );
  }

  const [fromY, fromM, fromD] = query.from.split('-').map(Number) as [number, number, number];
  const [toY, toM, toD] = query.to.split('-').map(Number) as [number, number, number];

  const fromDate = new Date(Date.UTC(fromY, fromM - 1, fromD, 0, 0, 0, 0));
  const toInclusive = new Date(Date.UTC(toY, toM - 1, toD, 23, 59, 59, 999));

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toInclusive.getTime())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid date value provided.');
  }

  const now = new Date();
  const todayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );

  if (fromDate < todayUtc) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Date "from" must be a current or future date.');
  }

  if (toInclusive < fromDate) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Date "to" cannot precede date "from".');
  }

  const diffMs = toInclusive.getTime() - fromDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 180) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Availability window cannot exceed 180 days.');
  }

  return { from: fromDate, toInclusive };
}

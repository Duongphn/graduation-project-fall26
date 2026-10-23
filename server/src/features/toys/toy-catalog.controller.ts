import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../../shared/errors/app-error.js';
import type { CatalogListingType, ToyCatalogQuery, ToyCatalogSort } from './toy-catalog.types.js';

import {
  validateAvailabilityQuery,
  validateToyId,
  validateToySearchQuery,
} from './toy-catalog.schemas.js';
import type { ToyCatalogService } from './toy-catalog.service.js';

export const DEFAULT_CATALOG_LIMIT = 20;
export const MAX_CATALOG_LIMIT = 100;

const LISTING_TYPES: readonly CatalogListingType[] = ['rent', 'sell', 'donate'];
const SORTS: readonly ToyCatalogSort[] = ['newest', 'popular'];

const invalid = (message: string) => new AppError(400, 'VALIDATION_ERROR', message);

/** Tham số query chỉ được xuất hiện một lần, dạng chuỗi (?a=1&a=2 hoặc ?a[x]=1 bị từ chối) */
function readString(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalid(`${name} must be a single value.`);
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): T | undefined {
  const raw = readString(value, name);
  if (raw === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw invalid(`${name} must be one of: ${allowed.join(', ')}.`);
  }
  return raw as T;
}

function readInteger(value: unknown, name: string, min: number): number | undefined {
  const raw = readString(value, name);
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < min) {
    throw invalid(`${name} must be an integer greater than or equal to ${min}.`);
  }
  return Number(raw);
}

export function parseToyCatalogQuery(query: Request['query']): ToyCatalogQuery {
  const listingType = readEnum(query.listingType, 'listingType', LISTING_TYPES);
  const sort = readEnum(query.sort, 'sort', SORTS) ?? 'newest';

  const categoryId = readString(query.categoryId, 'categoryId');
  if (categoryId !== undefined && !mongoose.Types.ObjectId.isValid(categoryId)) {
    throw invalid('categoryId must be a valid id.');
  }

  const minAge = readInteger(query.minAge, 'minAge', 0);
  const maxAge = readInteger(query.maxAge, 'maxAge', 0);
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    throw invalid('minAge must not be greater than maxAge.');
  }

  const page = readInteger(query.page, 'page', 1) ?? 1;
  const limit = Math.min(MAX_CATALOG_LIMIT, readInteger(query.limit, 'limit', 1) ?? DEFAULT_CATALOG_LIMIT);

  return {
    ...(listingType ? { listingType } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(minAge !== undefined ? { minAge } : {}),
    ...(maxAge !== undefined ? { maxAge } : {}),
    sort,
    page,
    limit,
  };
}

const SEARCH_ONLY_PARAMS = [
  'q',
  'type',
  'ageMin',
  'ageMax',
  'minPrice',
  'maxPrice',
  'lat',
  'lng',
  'radiusKm',
] as const;

export class ToyCatalogController {
  public constructor(private readonly service: ToyCatalogService) {}

  public search = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = validateToySearchQuery(req.query);
      const result = await this.service.search(query);
      res.status(200).json(result);
    } catch (err: unknown) {
      next(err);
    }
  };

  public getDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const toyId = validateToyId(req.params.toyId);
      const detail = await this.service.getDetail(toyId);
      res.status(200).json(detail);
    } catch (err: unknown) {
      next(err);
    }
  };

  public getAvailability = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const toyId = validateToyId(req.params.toyId);
      const { from, toInclusive } = validateAvailabilityQuery(req.query);
      const result = await this.service.getAvailability(toyId, from, toInclusive);
      res.status(200).json(result);
    } catch (err: unknown) {
      next(err);
    }
  };

  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.list(parseToyCatalogQuery(req.query));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /toys phục vụ hai màn hình (develop gộp hai nhánh vào cùng đường dẫn):
   * - trang tìm kiếm (UC05): q, type, ageMin/ageMax, giá, khu vực, hoặc có tham số sort (relevance, newest…);
   * - danh sách trang chủ: listingType, sort=popular, minAge/maxAge, hoặc chỉ có page/limit.
   */
  public index = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = req.query;
    const isHomeList =
      query.listingType !== undefined ||
      query.sort === 'popular' ||
      query.minAge !== undefined ||
      query.maxAge !== undefined;
    const isSearch =
      !isHomeList &&
      (SEARCH_ONLY_PARAMS.some((name) => query[name] !== undefined) || query.sort !== undefined);
    if (isSearch) {
      await this.search(req, res, next);
      return;
    }
    await this.list(req, res, next);
  };
}

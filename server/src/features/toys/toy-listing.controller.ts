import 'multer';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import '../../shared/contracts/request-actor.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { ListingFilterStatus } from './toy-listing.ports.js';
import {
  validateCreateToyListingInput,
  validateUpdateToyListingInput,
} from './toy-listing.schemas.js';
import type { ToyListingService } from './toy-listing.service.js';

function parsePositiveInteger(val: unknown, paramName: string): number {
  if (typeof val === 'number') {
    if (!Number.isFinite(val) || !Number.isInteger(val) || val < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', `${paramName} must be a positive integer.`);
    }
    return val;
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) {
      throw new AppError(400, 'VALIDATION_ERROR', `${paramName} must be a positive integer.`);
    }
    const num = Number(trimmed);
    if (!Number.isSafeInteger(num) || num < 1) {
      throw new AppError(400, 'VALIDATION_ERROR', `${paramName} must be a positive integer.`);
    }
    return num;
  }

  throw new AppError(400, 'VALIDATION_ERROR', `${paramName} must be a positive integer.`);
}

function parseToyId(toyIdParam: unknown): string {
  if (
    typeof toyIdParam !== 'string' ||
    !toyIdParam ||
    !mongoose.Types.ObjectId.isValid(toyIdParam)
  ) {
    throw new AppError(404, 'NOT_FOUND', 'Listing not found');
  }
  return toyIdParam;
}

function parseRemoveImagePublicIds(raw: unknown): string[] {
  if (raw === undefined || raw === null || raw === '') {
    return [];
  }

  if (Array.isArray(raw)) {
    if (!raw.every((item) => typeof item === 'string')) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'removeImagePublicIds must be an array of strings.',
      );
    }
    return raw;
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'removeImagePublicIds must be a JSON array of strings.',
        );
      }
      return parsed;
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'removeImagePublicIds must be a valid JSON array of strings.',
      );
    }
  }

  throw new AppError(
    400,
    'VALIDATION_ERROR',
    'removeImagePublicIds must be a JSON array string or an array of strings.',
  );
}

export class ToyListingController {
  public constructor(private readonly service: ToyListingService) {}

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const input = validateCreateToyListingInput(req.body);
      const files = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[];

      const created = await this.service.create(req.auth, input, files);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  };

  public listMine = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      let page = 1;
      if (req.query.page !== undefined) {
        page = parsePositiveInteger(req.query.page, 'page');
      }

      let limit = 20;
      if (req.query.limit !== undefined) {
        const parsedLimit = parsePositiveInteger(req.query.limit, 'limit');
        limit = Math.min(100, parsedLimit);
      }

      let status: ListingFilterStatus | undefined;
      if (req.query.status !== undefined) {
        if (typeof req.query.status !== 'string') {
          throw new AppError(
            400,
            'INVALID_STATUS_FILTER',
            `Invalid status filter "${String(req.query.status)}". Allowed values are pending, active, hidden, sold.`,
          );
        }
        const statusStr = req.query.status.trim();
        if (
          statusStr !== 'pending' &&
          statusStr !== 'active' &&
          statusStr !== 'hidden' &&
          statusStr !== 'sold'
        ) {
          throw new AppError(
            400,
            'INVALID_STATUS_FILTER',
            `Invalid status filter "${req.query.status}". Allowed values are pending, active, hidden, sold.`,
          );
        }
        status = statusStr;
      }

      const result = await this.service.listMine(req.auth, {
        ...(status ? { status } : {}),
        page,
        limit,
      });

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const toyId = parseToyId(req.params.toyId);
      const input = validateUpdateToyListingInput(req.body);
      const removeImagePublicIds = parseRemoveImagePublicIds(req.body?.removeImagePublicIds);
      const files = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[];

      const updated = await this.service.update(
        req.auth,
        toyId,
        input,
        files,
        removeImagePublicIds,
      );

      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  };

  public hide = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const toyId = parseToyId(req.params.toyId);
      const hidden = await this.service.hide(req.auth, toyId);

      res.status(200).json(hidden);
    } catch (err) {
      next(err);
    }
  };

  public delete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const toyId = parseToyId(req.params.toyId);
      await this.service.delete(req.auth, toyId);

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}

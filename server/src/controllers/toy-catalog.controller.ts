import type { NextFunction, Request, Response } from 'express';
import {
  parseToyCatalogQuery,
  validateAvailabilityQuery,
  validateToyId,
  validateToySearchQuery,
} from '../validations/toy-catalog.validation.js';
import type { ToyCatalogService } from '../services/toy-catalog.service.js';

export class ToyCatalogController {
  public constructor(private readonly service: ToyCatalogService) {}

  /** GET /toys/showcase — danh sách trang chủ */
  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.list(parseToyCatalogQuery(req.query));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

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
}

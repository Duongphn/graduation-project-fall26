import type { RequestHandler } from 'express';
import { CategoryService } from '../services/category.service.js';

export class CategoryController {
  public constructor(private readonly service: CategoryService = new CategoryService()) {}

  public list: RequestHandler = async (_req, res, next) => {
    try {
      res.status(200).json(await this.service.listActive());
    } catch (err) {
      next(err);
    }
  };
}

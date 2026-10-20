import { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { ToyCatalogController } from './toy-catalog.controller.js';
import type { ToyCatalogService } from './toy-catalog.service.js';

/** /toys/mine, /toys/:id/hide… belong to the listing router mounted after this one. */
const onlyToyIds = (req: Request, _res: Response, next: NextFunction) =>
  next(mongoose.Types.ObjectId.isValid(String(req.params.toyId)) ? undefined : 'route');

/**
 * Router công khai của /toys — KHÔNG dùng requireActor.
 * GET / (danh sách trang chủ hoặc tìm kiếm), GET /:toyId và /:toyId/availability; mọi đường dẫn
 * khác (/mine, POST, PATCH…) đi tiếp sang router đăng tin.
 */
export function createToyCatalogRouter(
  service: ToyCatalogService,
  controller: ToyCatalogController = new ToyCatalogController(service),
): Router {
  const router = Router();

  router.get('/', controller.browse);
  router.get('/:toyId/availability', onlyToyIds, controller.getAvailability);
  router.get('/:toyId', onlyToyIds, controller.getDetail);

  return router;
}

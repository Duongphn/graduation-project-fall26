import { Router } from 'express';
import { ToyCatalogController } from './toy-catalog.controller.js';
import type { ToyCatalogService } from './toy-catalog.service.js';

/**
 * Router công khai của /toys — KHÔNG dùng requireActor.
 * Chỉ khai báo đúng `GET /`; mọi đường dẫn khác (/mine, /:toyId…) đi tiếp sang router đăng tin.
 */
export function createToyCatalogRouter(
  service: ToyCatalogService,
  controller: ToyCatalogController = new ToyCatalogController(service),
): Router {
  const router = Router();

  router.get('/', controller.list);

  return router;
}

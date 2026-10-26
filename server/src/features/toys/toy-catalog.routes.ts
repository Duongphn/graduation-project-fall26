import { Router } from 'express';
import { ToyCatalogController } from './toy-catalog.controller.js';
import type { ToyCatalogService } from './toy-catalog.service.js';

/**
 * Router công khai của /toys — KHÔNG dùng requireActor.
 * Router đăng tin được gắn trước router này, nên /mine đã được xử lý trước khi tới `/:toyId`.
 * `/showcase` phải khai báo trước `/:toyId` để không bị hiểu là một toyId.
 */
export function createToyCatalogRouter(
  service: ToyCatalogService,
  controller: ToyCatalogController = new ToyCatalogController(service),
): Router {
  const router = Router();

  router.get('/', controller.search);
  router.get('/showcase', controller.list);
  router.get('/:toyId/availability', controller.getAvailability);
  router.get('/:toyId', controller.getDetail);

  return router;
}

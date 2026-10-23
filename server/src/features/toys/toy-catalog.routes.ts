import { Router } from 'express';
import { ToyCatalogController } from './toy-catalog.controller.js';
import type { ToyCatalogService } from './toy-catalog.service.js';

/**
 * Router công khai của /toys — KHÔNG dùng requireActor.
 * Gắn sau router đăng tin để /mine, POST, PATCH… vẫn do router đăng tin (bắt đăng nhập) xử lý.
 */
export function createToyCatalogRouter(
  service: ToyCatalogService,
  controller: ToyCatalogController = new ToyCatalogController(service),
): Router {
  const router = Router();

  router.get('/', controller.index);
  router.get('/:toyId/availability', controller.getAvailability);
  router.get('/:toyId', controller.getDetail);

  return router;
}

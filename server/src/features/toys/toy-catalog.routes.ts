import { Router } from 'express';
import { ToyCatalogController } from './toy-catalog.controller.js';
import type { ToyCatalogService } from './toy-catalog.service.js';

export function createToyCatalogRouter(
  service: ToyCatalogService,
  controller: ToyCatalogController = new ToyCatalogController(service),
): Router {
  const router = Router();

  router.get('/', controller.search);
  router.get('/:toyId/availability', controller.getAvailability);
  router.get('/:toyId', controller.getDetail);

  return router;
}

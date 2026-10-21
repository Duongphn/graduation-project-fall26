import type { Router } from 'express';
import { createToyCatalogRouter } from '../features/toys/toy-catalog.routes.js';
import { ToyCatalogService } from '../features/toys/toy-catalog.service.js';
import type { ToyCatalogReadPort } from '../features/toys/toy-catalog.ports.js';
import { AtlasToyCatalogRepository } from '../infrastructure/mongodb/atlas-toy-catalog.repository.js';

export interface ToyCatalogDependencies {
  service: ToyCatalogService;
  readPort: ToyCatalogReadPort;
  router: Router;
}

export interface CreateToyCatalogDependenciesOptions {
  readPort?: ToyCatalogReadPort;
}

export function createToyCatalogDependencies(
  options: CreateToyCatalogDependenciesOptions = {},
): ToyCatalogDependencies {
  const readPort = options.readPort ?? new AtlasToyCatalogRepository();
  const service = new ToyCatalogService(readPort);
  const router = createToyCatalogRouter(service);

  return {
    service,
    readPort,
    router,
  };
}

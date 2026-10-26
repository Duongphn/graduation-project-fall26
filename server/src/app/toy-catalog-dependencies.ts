import type { Router } from 'express';

import type { ToyCatalogReadPort } from '../interfaces/toy-catalog.ports.js';
import { AtlasToyCatalogRepository } from '../repositories/atlas-toy-catalog.repository.js';
import {
  createToyCatalogPorts,
  MongoToyCatalogRepository,
} from '../repositories/toy-catalog.repository.js';
import { createToyCatalogRouter } from '../routes/toy-catalog.routes.js';
import { ToyCatalogService } from '../services/toy-catalog.service.js';
import type { ToyCatalogPorts, ToyCatalogRepository } from '../types/toy-catalog.types.js';

export interface ToyCatalogDependencies {
  service: ToyCatalogService;
  router: Router;
}

export interface CreateToyCatalogDependenciesOptions {
  readPort?: ToyCatalogReadPort;
  repository?: ToyCatalogRepository;
  ports?: ToyCatalogPorts;
}

export function createToyCatalogDependencies(
  options?: CreateToyCatalogDependenciesOptions,
): ToyCatalogDependencies {
  const readPort = options?.readPort ?? new AtlasToyCatalogRepository();
  const repository = options?.repository ?? new MongoToyCatalogRepository();
  const ports = options?.ports ?? createToyCatalogPorts();

  const service = new ToyCatalogService(readPort, repository, ports);
  const router = createToyCatalogRouter(service);

  return { service, router };
}

import type { Router } from 'express';

import PurchaseOrder from '../features/purchase_orders/purchase_orders.model.js';
import RentalOrder from '../features/rental_orders/rental_orders.model.js';
import type { ToyCatalogReadPort } from '../features/toys/toy-catalog.ports.js';
import { MongoToyCatalogRepository } from '../features/toys/toy-catalog.repository.js';
import { createToyCatalogRouter } from '../features/toys/toy-catalog.routes.js';
import { ToyCatalogService } from '../features/toys/toy-catalog.service.js';
import type { ToyCatalogPorts, ToyCatalogRepository } from '../features/toys/toy-catalog.types.js';
import { AtlasToyCatalogRepository } from '../infrastructure/mongodb/atlas-toy-catalog.repository.js';

export interface ToyCatalogDependencies {
  service: ToyCatalogService;
  router: Router;
}

export interface CreateToyCatalogDependenciesOptions {
  readPort?: ToyCatalogReadPort;
  repository?: ToyCatalogRepository;
  ports?: ToyCatalogPorts;
}

// Cùng quy tắc với toy-listing-dependencies.ts
const COMPLETED_STATUS_REGEX = /^completed$/i;
const NOT_COUNTED_RENTAL_STATUS_REGEX = /^(rejected|cancell?ed|expired)$/i;

export function createToyCatalogDependencies(
  options?: CreateToyCatalogDependenciesOptions,
): ToyCatalogDependencies {
  const readPort = options?.readPort ?? new AtlasToyCatalogRepository();
  const repository = options?.repository ?? new MongoToyCatalogRepository();

  const ports: ToyCatalogPorts = options?.ports ?? {
    async getSoldToyIds(): Promise<string[]> {
      const toyIds = await PurchaseOrder.distinct('toyId', {
        status: { $regex: COMPLETED_STATUS_REGEX },
      });
      return toyIds.map((toyId) => toyId.toString());
    },

    async getRentalCountsSince(since: Date): Promise<Map<string, number>> {
      const rows = await RentalOrder.aggregate<{ _id: unknown; count: number }>([
        { $match: { createdAt: { $gte: since }, status: { $not: NOT_COUNTED_RENTAL_STATUS_REGEX } } },
        { $group: { _id: '$toyId', count: { $sum: 1 } } },
      ]);
      return new Map(rows.map((row) => [String(row._id), row.count]));
    },
  };

  const service = new ToyCatalogService(readPort, repository, ports);
  const router = createToyCatalogRouter(service);

  return { service, router };
}

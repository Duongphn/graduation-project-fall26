import { Router } from 'express';

import { env } from '../config/env.js';
import type { ToyListingPorts } from '../interfaces/toy-listing.ports.js';
import { createToyListingPorts } from '../repositories/toy-listing.repository.js';
import { createToyListingRouter } from '../routes/toy-listing.routes.js';
import { ToyListingService } from '../services/toy-listing.service.js';
import { configureCloudinary } from '../integrations/cloudinary/cloudinary-client.js';
import {
  CloudinaryImageStorage,
  type ToyImageStorage,
} from '../integrations/cloudinary/cloudinary-image-storage.js';
import { AppError } from '../utils/app-error.js';

export interface ToyListingDependencies {
  service: ToyListingService;
  imageStorage: ToyImageStorage;
  router: Router;
}

export interface CreateToyListingDependenciesOptions {
  ports?: ToyListingPorts;
  imageStorage?: ToyImageStorage;
}

function createDefaultToyImageStorage(): ToyImageStorage {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET || env.CLOUDINARY_API_SECRET;

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET ||
    !cloudName ||
    !apiKey ||
    !apiSecret
  ) {
    return {
      async upload(): Promise<{ url: string; publicId: string }> {
        throw new AppError(
          500,
          'CLOUDINARY_NOT_CONFIGURED',
          'Cloudinary credentials are not configured.',
        );
      },
      async delete(): Promise<void> {
        throw new AppError(
          500,
          'CLOUDINARY_NOT_CONFIGURED',
          'Cloudinary credentials are not configured.',
        );
      },
    };
  }

  return new CloudinaryImageStorage({
    client: configureCloudinary({ cloudName, apiKey, apiSecret }),
  });
}

export function createToyListingDependencies(
  options?: CreateToyListingDependenciesOptions,
): ToyListingDependencies {
  const imageStorage = options?.imageStorage ?? createDefaultToyImageStorage();

  const ports = options?.ports ?? createToyListingPorts();

  const service = new ToyListingService(ports, imageStorage);
  const router = createToyListingRouter(service);

  return { service, imageStorage, router };
}

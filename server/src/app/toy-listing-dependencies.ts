import { Router } from 'express';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import Category from '../features/categories/categories.model.js';
import IdentityVerification from '../features/identity_verifications/identity_verifications.model.js';
import PurchaseOrder from '../features/purchase_orders/purchase_orders.model.js';
import RentalOrder from '../features/rental_orders/rental_orders.model.js';
import type { ToyListingPorts } from '../interfaces/toy-listing.ports.js';
import { createToyListingRouter } from '../features/toys/toy-listing.routes.js';
import { ToyListingService } from '../features/toys/toy-listing.service.js';
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

const TERMINAL_ORDER_STATUS_REGEX = /^(completed|rejected|cancell?ed|expired)$/i;
const VERIFIED_STATUS_REGEX = /^verified$/i;
const ACTIVE_STATUS_REGEX = /^active$/i;
const COMPLETED_STATUS_REGEX = /^completed$/i;

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

  const ports: ToyListingPorts = options?.ports ?? {
    async isVerifiedUser(userId: string): Promise<boolean> {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return false;
      }
      const record = await IdentityVerification.exists({
        userId,
        status: { $regex: VERIFIED_STATUS_REGEX },
      });
      return Boolean(record);
    },

    async categoryExists(categoryId: string): Promise<boolean> {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return false;
      }
      const record = await Category.exists({
        _id: categoryId,
        status: { $regex: ACTIVE_STATUS_REGEX },
      });
      return Boolean(record);
    },

    async hasUnfinishedOrder(toyId: string): Promise<boolean> {
      if (!mongoose.Types.ObjectId.isValid(toyId)) {
        return false;
      }
      const unfinishedFilter = {
        toyId,
        status: { $not: TERMINAL_ORDER_STATUS_REGEX },
      };

      const [hasRental, hasPurchase] = await Promise.all([
        RentalOrder.exists(unfinishedFilter),
        PurchaseOrder.exists(unfinishedFilter),
      ]);

      return Boolean(hasRental || hasPurchase);
    },

    async getSoldToyIds(toyIds: string[]): Promise<Set<string>> {
      if (!toyIds || toyIds.length === 0) {
        return new Set<string>();
      }

      const validToyIds = toyIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validToyIds.length === 0) {
        return new Set<string>();
      }

      const completedOrders = await PurchaseOrder.find(
        {
          toyId: { $in: validToyIds },
          status: { $regex: COMPLETED_STATUS_REGEX },
        },
        { toyId: 1 },
      ).lean();

      const soldToyIds = new Set<string>();
      for (const order of completedOrders) {
        if (order.toyId) {
          soldToyIds.add(order.toyId.toString());
        }
      }

      return soldToyIds;
    },
  };

  const service = new ToyListingService(ports, imageStorage);
  const router = createToyListingRouter(service);

  return { service, imageStorage, router };
}

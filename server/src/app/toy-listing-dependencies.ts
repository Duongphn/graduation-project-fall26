import { Router } from 'express';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { CategoryModel as Category } from '../features/categories/categories.model.js';
import { IdentityVerificationModel as IdentityVerification } from '../features/identity_verifications/identity_verifications.model.js';
import { PurchaseOrderModel as PurchaseOrder } from '../features/purchase_orders/purchase_orders.model.js';
import { RentalOrderModel as RentalOrder } from '../features/rental_orders/rental_orders.model.js';
import type { ToyListingPorts } from '../features/toys/toy-listing.ports.js';
import { createToyListingRouter } from '../features/toys/toy-listing.routes.js';
import { ToyListingService } from '../features/toys/toy-listing.service.js';
import { configureCloudinary } from '../infrastructure/cloudinary/cloudinary-client.js';
import {
  CloudinaryImageStorage,
  type ToyImageStorage,
} from '../infrastructure/cloudinary/cloudinary-image-storage.js';
import { withTransaction } from '../infrastructure/database/schema-types.js';
import { isCloudinaryConfigured } from '../infrastructure/storage/cloudinary.js';
import {
  finishedRentalOrderStatuses,
  finishedResaleOrderStatuses,
  type ResaleOrderStatus,
  type VerificationStatus,
  type VisibilityStatus,
} from '../shared/domain/statuses.js';
import { AppError } from '../shared/errors/app-error.js';

export interface ToyListingDependencies {
  service: ToyListingService;
  imageStorage: ToyImageStorage;
  router: Router;
}

export interface CreateToyListingDependenciesOptions {
  ports?: ToyListingPorts;
  imageStorage?: ToyImageStorage;
}

// Toy images go through the SDK client of infrastructure/cloudinary, configured from env.ts.
function createDefaultToyImageStorage(): ToyImageStorage {
  const credentials = env.cloudinary;
  if (!isCloudinaryConfigured(credentials)) {
    const notConfigured = () =>
      new AppError(500, 'CLOUDINARY_NOT_CONFIGURED', 'Cloudinary credentials are not configured.');
    return {
      async upload(): Promise<{ url: string; publicId: string }> {
        throw notConfigured();
      },
      async delete(): Promise<void> {
        throw notConfigured();
      },
    };
  }

  return new CloudinaryImageStorage({ client: configureCloudinary(credentials) });
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
        status: 'VERIFIED' satisfies VerificationStatus,
      });
      return Boolean(record);
    },

    async categoryExists(categoryId: string): Promise<boolean> {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return false;
      }
      const record = await Category.exists({
        _id: categoryId,
        status: 'ACTIVE' satisfies VisibilityStatus,
      });
      return Boolean(record);
    },

    // Touch writes instead of reads (docs/database.md "Concurrency rules"): the conditional write
    // makes a concurrent hide or delete of the category conflict with this transaction.
    async saveWithActiveCategory(categoryId, save) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return null;
      }
      return withTransaction(async (session) => {
        const category = await Category.findOneAndUpdate(
          { _id: categoryId, status: 'ACTIVE' satisfies VisibilityStatus },
          { $inc: { __v: 1 } },
          { session, timestamps: false, projection: { name: 1 } },
        );
        if (!category) return null;
        return { result: await save(session), categoryName: category.name };
      });
    },

    async hasUnfinishedOrder(toyId: string): Promise<boolean> {
      if (!mongoose.Types.ObjectId.isValid(toyId)) {
        return false;
      }
      const [hasRental, hasPurchase] = await Promise.all([
        RentalOrder.exists({ toyId, status: { $nin: finishedRentalOrderStatuses } }),
        PurchaseOrder.exists({ toyId, status: { $nin: finishedResaleOrderStatuses } }),
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
          status: 'COMPLETED' satisfies ResaleOrderStatus,
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

    // Any status: a listing keeps showing the name of a category an Admin hid later.
    async getCategoryNames(categoryIds: string[]): Promise<Map<string, string>> {
      const validIds = categoryIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length === 0) {
        return new Map<string, string>();
      }
      const categories = await Category.find({ _id: { $in: validIds } }, { name: 1 }).lean();
      return new Map(categories.map((category) => [category._id.toString(), category.name]));
    },
  };

  const service = new ToyListingService(ports, imageStorage);
  const router = createToyListingRouter(service);

  return { service, imageStorage, router };
}

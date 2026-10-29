import mongoose from 'mongoose';

import type { ToyListingPorts } from '../interfaces/toy-listing.ports.js';
import Category from '../models/category.model.js';
import IdentityVerification from '../models/identity-verification.model.js';
import PurchaseOrder from '../models/purchase-order.model.js';
import RentalOrder from '../models/rental-order.model.js';

const TERMINAL_ORDER_STATUS_REGEX = /^(completed|rejected|cancell?ed|expired)$/i;
const VERIFIED_STATUS_REGEX = /^verified$/i;
const ACTIVE_STATUS_REGEX = /^active$/i;
const COMPLETED_STATUS_REGEX = /^completed$/i;

/** Truy vấn ngoài collection toys mà ToyListingService cần (xác minh, danh mục, đơn hàng) */
export function createToyListingPorts(): ToyListingPorts {
  return {
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
}

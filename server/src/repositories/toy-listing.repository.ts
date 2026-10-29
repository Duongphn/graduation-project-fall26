import mongoose from 'mongoose';

import type { ToyListingPorts } from '../interfaces/toy-listing.ports.js';
import Category from '../models/category.model.js';
import IdentityVerification from '../models/identity-verification.model.js';
import PurchaseOrder from '../models/purchase-order.model.js';
import RentalOrder from '../models/rental-order.model.js';
import { withTransaction } from '../utils/transaction.js';

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

    // A touch write instead of a read: the Admin hide (changeStatus) and delete (lockForDelete)
    // of a category write the same document in their own transaction, so the two conflict and
    // withTransaction retries the loser with fresh data. Timestamps off: a toy save is not an
    // edit of the category (the Admin list shows its updatedAt). Each retry calls `save` again,
    // so `save` builds its write inside (see the port).
    async saveWithActiveCategory(categoryId, save) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) {
        return null;
      }
      return withTransaction(async (session) => {
        const category = await Category.findOneAndUpdate(
          { _id: categoryId, status: { $regex: ACTIVE_STATUS_REGEX } },
          { $inc: { __v: 1 } },
          { session, timestamps: false, projection: { name: 1 } },
        );
        if (!category) {
          return null;
        }
        return { result: await save(session), categoryName: category.name };
      });
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
}

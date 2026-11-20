import mongoose, { type ClientSession } from 'mongoose';

import type { ToyListingPorts } from '../interfaces/toy-listing.ports.js';
import Category from '../models/category.model.js';
import { DonationRequest } from '../models/donation-request.model.js';
import IdentityVerification from '../models/identity-verification.model.js';
import PurchaseOrder from '../models/purchase-order.model.js';
import RentalOrder from '../models/rental-order.model.js';
import { closePendingRequestsForToy } from '../services/donation-request.lifecycle.js';
import { withTransaction } from '../utils/transaction.js';

const TERMINAL_ORDER_STATUS_REGEX = /^(completed|rejected|cancell?ed|expired)$/i;
const VERIFIED_STATUS_REGEX = /^verified$/i;
const ACTIVE_STATUS_REGEX = /^active$/i;
const COMPLETED_STATUS_REGEX = /^completed$/i;

/**
 * ToyListingPorts.saveWithActiveCategory (see the port), also used by POST /donation-posts: every
 * toy save that needs an active category goes through it ("Category rules" in docs/api/toys.md).
 * A touch write instead of a read: the Admin hide (changeStatus) and delete (lockForDelete) of a
 * category write the same document in their own transaction, so the two conflict and
 * withTransaction retries the loser with fresh data. Timestamps off: a toy save is not an edit of
 * the category (the Admin list shows its updatedAt). Each retry calls `save` again, so `save`
 * builds its write inside.
 */
export async function saveWithActiveCategory<T>(
  categoryId: string,
  save: (session: ClientSession) => Promise<T>,
): Promise<{ result: T; categoryName: string } | null> {
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
}

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

    saveWithActiveCategory,

    async hasUnfinishedOrder(toyId: string): Promise<boolean> {
      if (!mongoose.Types.ObjectId.isValid(toyId)) {
        return false;
      }
      const unfinishedFilter = {
        toyId,
        status: { $not: TERMINAL_ORDER_STATUS_REGEX },
      };

      const [hasRental, hasPurchase, hasDonation] = await Promise.all([
        RentalOrder.exists(unfinishedFilter),
        PurchaseOrder.exists(unfinishedFilter),
        // GB-60: a donation post with an accepted or shipping request is being handed over.
        DonationRequest.exists({ toyId, status: { $in: ['accepted', 'shipping'] } }),
      ]);

      return Boolean(hasRental || hasPurchase || hasDonation);
    },

    closePendingDonationRequests: closePendingRequestsForToy,

    async isDonated(toyId: string): Promise<boolean> {
      if (!mongoose.Types.ObjectId.isValid(toyId)) {
        return false;
      }
      const record = await DonationRequest.exists({
        toyId,
        status: { $in: ['received', 'completed'] },
      });
      return Boolean(record);
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

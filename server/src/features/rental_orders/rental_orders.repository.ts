import type { Types } from 'mongoose';

import { withTransaction } from '../../infrastructure/database/schema-types.js';
import { calendarBlockingStatuses } from '../../shared/domain/statuses.js';
import { OrderStatusHistoryModel } from '../order_status_history/order_status_history.model.js';
import { ToyModel } from '../toys/toys.model.js';
import { RentalOrderModel } from './rental_orders.model.js';

export class CalendarConflictError extends Error {
  constructor() {
    super('The toy is already booked for some of these dates.');
    this.name = 'CalendarConflictError';
  }
}

/**
 * The Owner accepts a rental request (BF-02 step 3). MongoDB cannot enforce "no overlapping
 * bookings" with an index, so the transaction first writes the toy document: two concurrent
 * accepts for the same toy then conflict, one is retried, and the retry sees the other
 * booking. Bookings are half-open ranges [startDate, endDate).
 */
export const acceptRentalOrder = (
  orderId: Types.ObjectId,
  ownerId: Types.ObjectId,
): Promise<void> =>
  withTransaction(async (session) => {
    const order = await RentalOrderModel.findOne(
      { _id: orderId, ownerId, status: 'REQUESTED' },
      null,
      { session },
    );
    if (!order?.period) {
      throw new Error('The rental request cannot be accepted.');
    }
    const { startDate, endDate } = order.period;

    await ToyModel.updateOne({ _id: order.toyId }, { $inc: { calendarVersion: 1 } }, { session });

    const overlapping = await RentalOrderModel.exists({
      _id: { $ne: order._id },
      toyId: order.toyId,
      status: { $in: calendarBlockingStatuses },
      'period.startDate': { $lt: endDate },
      'period.endDate': { $gt: startDate },
    }).session(session);
    if (overlapping) {
      throw new CalendarConflictError();
    }

    await RentalOrderModel.updateOne(
      { _id: order._id, status: 'REQUESTED' },
      { $set: { status: 'ACCEPTED' } },
      { session },
    );
    await OrderStatusHistoryModel.create(
      [
        {
          orderType: 'RENTAL',
          orderId: order._id,
          fromStatus: 'REQUESTED',
          toStatus: 'ACCEPTED',
          actor: { type: 'USER', userId: ownerId },
        },
      ],
      { session },
    );
  });

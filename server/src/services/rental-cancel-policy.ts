import { type RentalOrderStatus } from '../constants/rental-order-status.js';
import {
  type CancelDecision,
  type RentalCancelActor,
  splitCancelRefund,
} from '../types/order-cancel.types.js';
import { type RentalSettings } from '../types/rental-order.types.js';
import { startOfRental } from './rental-time.js';

export interface RentalCancelOrderInput {
  status: RentalOrderStatus;
  pricing: {
    rentalFee: number;
    totalPayable: number;
  };
  period: {
    startDate: Date;
  };
}

export const decideRentalCancel = (
  order: RentalCancelOrderInput,
  by: RentalCancelActor,
  now: Date,
  settings: Pick<RentalSettings, 'cancelFeeRate'>,
): CancelDecision => {
  switch (order.status) {
    case 'PENDING':
      if (by === 'OWNER') {
        return {
          allowed: false,
          code: 'RENTAL_CANCEL_USE_REJECT',
          message: 'Chủ đồ chơi hãy dùng chức năng từ chối cho yêu cầu đang chờ.',
        };
      }
      return { allowed: true, fee: 0, refund: 0 };

    case 'ACCEPTED':
      return { allowed: true, fee: 0, refund: 0 };

    case 'PAID': {
      if (by === 'OWNER') {
        return { allowed: true, fee: 0, refund: order.pricing.totalPayable };
      }
      // RENTER cancels PAID
      const rentalStartTime = startOfRental(order.period.startDate).getTime();
      if (now.getTime() >= rentalStartTime) {
        // Owner has not shipped by rental start date -> cancel without fee
        return { allowed: true, fee: 0, refund: order.pricing.totalPayable };
      }

      const calculatedFee = Math.round(settings.cancelFeeRate * order.pricing.rentalFee);
      const { fee, refund } = splitCancelRefund(order.pricing.totalPayable, calculatedFee);
      return { allowed: true, fee, refund };
    }

    case 'SHIPPING':
    case 'IN_USE':
    case 'RETURNING':
    case 'DISPUTING':
      return {
        allowed: false,
        code: 'RENTAL_CANCEL_NOT_ALLOWED',
        message: 'Đơn đã giao hàng, không thể hủy. Vui lòng mở khiếu nại nếu có vấn đề.',
      };

    case 'COMPLETED':
    case 'REJECTED':
    case 'EXPIRED':
    case 'CANCELLED':
    default:
      return {
        allowed: false,
        code: 'INVALID_RENTAL_TRANSITION',
        message: 'Trạng thái đơn thuê không hợp lệ hoặc đã thay đổi.',
      };
  }
};

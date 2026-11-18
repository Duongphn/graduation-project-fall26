import type { IRentalOrder, RentalOrderDoc } from '../models/rental-order.model.js';
import {
  type AdminFinancialBreakdownDto,
  type AdminFinancialItemsDto,
  type FinancialBreakdownSummaryDto,
  type OwnerFinancialBreakdownDto,
  type OwnerFinancialItemsDto,
  type RentalFinancialBreakdownDto,
  type RentalPayoutStatus,
  type RentalSettlementStatus,
  type RenterFinancialBreakdownDto,
  type RenterFinancialItemsDto,
} from '../types/rental-order.types.js';

const TERMINAL_RENTAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED']);

function formatCurrency(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)} VND`;
}

function checkIsPaid(order: IRentalOrder | RentalOrderDoc): boolean {
  const dynamicOrder = order as unknown as { isPaid?: unknown; paid?: unknown; paidAt?: unknown };
  if (typeof dynamicOrder.isPaid === 'boolean') {
    return dynamicOrder.isPaid;
  }
  if (typeof dynamicOrder.paid === 'boolean') {
    return dynamicOrder.paid;
  }
  if (dynamicOrder.paidAt) {
    return true;
  }

  // Active or past paid statuses
  if (
    order.status === 'PAID' ||
    order.status === 'SHIPPING' ||
    order.status === 'IN_USE' ||
    order.status === 'RETURNING' ||
    order.status === 'COMPLETED' ||
    order.status === 'DISPUTING'
  ) {
    return true;
  }

  // If physical handover occurred, payment was required
  if (order.rentalStartedAt || order.handover?.shippedAt || order.handover?.receivedAt) {
    return true;
  }

  return false;
}

export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'renter',
): RenterFinancialBreakdownDto;
export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'owner',
): OwnerFinancialBreakdownDto;
export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'admin',
): AdminFinancialBreakdownDto;
export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'renter' | 'owner' | 'admin',
): RentalFinancialBreakdownDto;
export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'renter' | 'owner' | 'admin',
): RentalFinancialBreakdownDto {
  const isTerminal = TERMINAL_RENTAL_STATUSES.has(order.status);
  const isEstimated = !isTerminal;
  const currency = 'VND';

  const rentalFee = order.pricing?.rentalFee ?? 0;
  const depositAmount = order.pricing?.depositAmount ?? 0;
  const platformFeeRate = order.pricing?.platformFeeRate ?? 0;
  const platformFee =
    order.pricing?.platformFee ?? Math.round(rentalFee * platformFeeRate);
  const lateFee = order.returnInfo?.lateFee ?? 0;

  const isPaid = checkIsPaid(order);
  const depositPaid = isPaid ? depositAmount : 0;

  // 1. Renter View Calculation
  let settlementStatus: RentalSettlementStatus;
  let depositRefunded: number;
  let totalActualCost: number;

  if (order.status === 'PENDING' || order.status === 'ACCEPTED') {
    settlementStatus = 'PENDING_PAYMENT';
    depositRefunded = 0;
    totalActualCost = rentalFee + lateFee;
  } else if (order.status === 'DISPUTING') {
    settlementStatus = 'DISPUTED';
    depositRefunded = 0; // frozen in escrow
    totalActualCost = rentalFee + lateFee;
  } else if (order.status === 'CANCELLED' || order.status === 'REJECTED' || order.status === 'EXPIRED') {
    settlementStatus = isPaid ? 'REFUNDED' : 'CANCELLED';
    depositRefunded = isPaid ? depositPaid : 0;
    totalActualCost = 0;
  } else if (order.status === 'COMPLETED') {
    settlementStatus = 'SETTLED';
    depositRefunded = Math.max(0, depositPaid - lateFee);
    totalActualCost = rentalFee + lateFee;
  } else {
    // In-flight paid states: PAID, SHIPPING, IN_USE, RETURNING
    settlementStatus = 'HELD_IN_ESCROW';
    depositRefunded = Math.max(0, depositPaid - lateFee);
    totalActualCost = rentalFee + lateFee;
  }

  let renterDescription: string;
  switch (settlementStatus) {
    case 'SETTLED':
      renterDescription = `Đơn thuê đã quyết toán xong. Bạn đã thanh toán ${formatCurrency(totalActualCost)} và nhận lại ${formatCurrency(depositRefunded)} tiền cọc.`;
      break;
    case 'PENDING_PAYMENT':
      renterDescription = 'Đang chờ người thuê thanh toán tiền thuê và tiền cọc.';
      break;
    case 'HELD_IN_ESCROW':
      renterDescription =
        lateFee > 0
          ? `Tiền cọc và tiền thuê đang được giữ trong tài khoản ký quỹ. Phí trễ hạn tạm tính: ${formatCurrency(lateFee)}.`
          : 'Tiền cọc và tiền thuê đang được giữ an toàn trong tài khoản ký quỹ.';
      break;
    case 'DISPUTED':
      renterDescription =
        'Đơn thuê đang trong quá trình khiếu nại. Toàn bộ tiền cọc và tiền thuê tạm thời bị đóng băng để giải quyết tranh chấp.';
      break;
    case 'REFUNDED':
      renterDescription = 'Đơn thuê đã bị huỷ. Tiền đã được hoàn lại đầy đủ vào ví của bạn.';
      break;
    case 'CANCELLED':
      renterDescription = 'Đơn thuê đã bị huỷ trước khi thanh toán.';
      break;
  }

  const renterItems: RenterFinancialItemsDto = {
    rentalFee,
    depositPaid,
    lateFee,
    depositRefunded,
    totalActualCost,
  };

  const renterSummary: FinancialBreakdownSummaryDto = {
    status: settlementStatus,
    description: renterDescription,
  };

  const renterView: RenterFinancialBreakdownDto = {
    role: 'renter',
    currency,
    isEstimated,
    settlementStatus,
    items: renterItems,
    summary: renterSummary,
  };

  if (role === 'renter') {
    return renterView;
  }

  // 2. Owner View Calculation
  let payoutStatus: RentalPayoutStatus;
  let lateCompensation: number;
  let netEarnings: number;

  const grossRentalFee = rentalFee;

  if (order.status === 'PENDING' || order.status === 'ACCEPTED') {
    payoutStatus = 'WAITING_PAYMENT';
    lateCompensation = 0;
    netEarnings = Math.max(0, grossRentalFee - platformFee + lateCompensation);
  } else if (order.status === 'DISPUTING') {
    payoutStatus = 'DISPUTED';
    lateCompensation = lateFee;
    netEarnings = 0; // frozen in escrow pending resolution
  } else if (order.status === 'CANCELLED' || order.status === 'REJECTED' || order.status === 'EXPIRED') {
    payoutStatus = 'CANCELLED';
    lateCompensation = 0;
    netEarnings = 0;
  } else if (order.status === 'COMPLETED') {
    payoutStatus = 'PAID_OUT';
    lateCompensation = lateFee;
    netEarnings = Math.max(0, grossRentalFee - platformFee + lateCompensation);
  } else {
    // In-flight paid states: PAID, SHIPPING, IN_USE, RETURNING
    payoutStatus = 'ESCROW_HELD';
    lateCompensation = lateFee;
    netEarnings = Math.max(0, grossRentalFee - platformFee + lateCompensation);
  }

  let ownerDescription: string;
  switch (payoutStatus) {
    case 'PAID_OUT':
      ownerDescription = `Đơn thuê đã quyết toán hoàn tất. Thu nhập ${formatCurrency(netEarnings)} đã được giải ngân vào ví của bạn.`;
      break;
    case 'WAITING_PAYMENT':
      ownerDescription = 'Đang chờ người thuê thực hiện thanh toán.';
      break;
    case 'ESCROW_HELD':
      ownerDescription =
        lateCompensation > 0
          ? `Tiền thuê đang được ký quỹ. Dự kiến nhận: ${formatCurrency(netEarnings)} (bao gồm bồi thường trễ hạn ${formatCurrency(lateCompensation)}).`
          : 'Tiền thuê đang được giữ trong tài khoản ký quỹ và sẽ được giải ngân sau khi hoàn tất đơn thuê.';
      break;
    case 'DISPUTED':
      ownerDescription =
        'Đơn thuê đang trong quá trình khiếu nại. Tiền thanh toán tạm thời bị đóng băng.';
      break;
    case 'CANCELLED':
      ownerDescription = 'Đơn thuê đã kết thúc và không phát sinh thu nhập.';
      break;
  }

  const ownerItems: OwnerFinancialItemsDto = {
    grossRentalFee,
    platformFeeRate,
    platformFee,
    lateCompensation,
    netEarnings,
  };

  const ownerSummary: FinancialBreakdownSummaryDto = {
    status: payoutStatus,
    description: ownerDescription,
  };

  const ownerView: OwnerFinancialBreakdownDto = {
    role: 'owner',
    currency,
    isEstimated,
    payoutStatus,
    items: ownerItems,
    summary: ownerSummary,
  };

  if (role === 'owner') {
    return ownerView;
  }

  // 3. Admin View Calculation
  let escrowBalance = 0;
  if (!isTerminal) {
    if (isPaid) {
      escrowBalance = order.pricing?.totalPayable ?? rentalFee + depositAmount;
    }
  }

  // Phí nền tảng chỉ vào ví platform khi quyết toán (postSettleLedger)
  const platformRevenue = order.status === 'COMPLETED' ? platformFee : 0;

  const adminItems: AdminFinancialItemsDto = {
    rentalFee,
    depositPaid,
    lateFee,
    depositRefunded,
    totalActualCost,
    grossRentalFee,
    platformFeeRate,
    platformFee,
    lateCompensation,
    netEarnings,
    escrowBalance,
    platformRevenue,
    renter: renterItems,
    owner: ownerItems,
  };

  const adminSummary: FinancialBreakdownSummaryDto = {
    status: isTerminal ? settlementStatus : 'IN_PROGRESS',
    description: isTerminal
      ? `Toàn cảnh tài chính đơn thuê đã kết thúc với trạng thái ${settlementStatus}.`
      : 'Toàn cảnh tài chính đơn thuê đang trong tiến trình xử lý.',
  };

  return {
    role: 'admin',
    currency,
    isEstimated,
    settlementStatus,
    payoutStatus,
    items: adminItems,
    renter: renterView,
    owner: ownerView,
    platformRevenue,
    summary: adminSummary,
  };
}

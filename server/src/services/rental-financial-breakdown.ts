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

/** What the caller knows beyond the order document. */
export interface FinancialBreakdownContext {
  /** The order reached PAID at some point (from the status history) */
  wasPaid?: boolean | undefined;
}

function checkIsPaid(
  order: IRentalOrder | RentalOrderDoc,
  context: FinancialBreakdownContext,
): boolean {
  if (typeof context.wasPaid === 'boolean') {
    return context.wasPaid;
  }
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

  // A cancel fee is only charged on a paid order
  if ((order.cancellation?.fee ?? 0) > 0) {
    return true;
  }

  return false;
}

/**
 * The cancel ledger of a paid order (rental-order.service cancel): escrow pays back R + D, the fee
 * goes to the owner and the rest to the renter. The fee is taken from the rent first.
 */
function paidCancelSplit(order: IRentalOrder | RentalOrderDoc) {
  const rentalFee = order.pricing?.rentalFee ?? 0;
  const depositAmount = order.pricing?.depositAmount ?? 0;
  const total = order.pricing?.totalPayable ?? rentalFee + depositAmount;
  const fee = Math.min(Math.max(order.cancellation?.fee ?? 0, 0), total);
  return {
    fee,
    refund: total - fee,
    rentRefunded: Math.max(0, rentalFee - fee),
    depositRefunded: Math.max(0, depositAmount - Math.max(0, fee - rentalFee)),
  };
}

export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'renter',
  context?: FinancialBreakdownContext,
): RenterFinancialBreakdownDto;
export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'owner',
  context?: FinancialBreakdownContext,
): OwnerFinancialBreakdownDto;
export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'admin',
  context?: FinancialBreakdownContext,
): AdminFinancialBreakdownDto;
export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'renter' | 'owner' | 'admin',
  context?: FinancialBreakdownContext,
): RentalFinancialBreakdownDto;
export function computeFinancialBreakdown(
  order: IRentalOrder | RentalOrderDoc,
  role: 'renter' | 'owner' | 'admin',
  context: FinancialBreakdownContext = {},
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

  const isPaid = checkIsPaid(order, context);
  const depositPaid = isPaid ? depositAmount : 0;
  const isCancelled =
    order.status === 'CANCELLED' || order.status === 'REJECTED' || order.status === 'EXPIRED';
  // Paid then cancelled: refund and fee as posted by the cancel ledger
  const cancelSplit = isCancelled && isPaid ? paidCancelSplit(order) : undefined;
  // Dispute ruling: the Admin's split (rulingSplit) replaces the GOOD settlement
  const ruling = order.status === 'COMPLETED' ? order.settlement?.resolution : undefined;

  // 1. Renter View Calculation
  let settlementStatus: RentalSettlementStatus;
  let depositRefunded: number;
  let totalActualCost: number;
  const renterExtras: Partial<RenterFinancialItemsDto> = {};

  if (order.status === 'PENDING' || order.status === 'ACCEPTED') {
    settlementStatus = 'PENDING_PAYMENT';
    depositRefunded = 0;
    totalActualCost = rentalFee + lateFee;
  } else if (order.status === 'DISPUTING') {
    settlementStatus = 'DISPUTED';
    depositRefunded = 0; // frozen in escrow
    totalActualCost = rentalFee + lateFee;
  } else if (isCancelled) {
    if (cancelSplit) {
      settlementStatus = 'REFUNDED';
      depositRefunded = cancelSplit.depositRefunded;
      totalActualCost = cancelSplit.fee;
      renterExtras.rentRefunded = cancelSplit.rentRefunded;
      renterExtras.cancelFee = cancelSplit.fee;
      renterExtras.totalRefunded = cancelSplit.refund;
    } else {
      settlementStatus = 'CANCELLED';
      depositRefunded = 0;
      totalActualCost = 0;
    }
  } else if (ruling) {
    settlementStatus = 'SETTLED';
    // renterAmount = D - L - K + G; the cost is everything paid that did not come back
    depositRefunded = Math.max(0, depositPaid - lateFee - ruling.compensationAmount);
    totalActualCost = rentalFee + depositPaid - ruling.renterAmount;
    renterExtras.rentRefunded = ruling.rentRefundAmount;
    renterExtras.compensation = ruling.compensationAmount;
    renterExtras.totalRefunded = ruling.renterAmount;
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
      renterDescription = ruling
        ? `Đơn thuê đã quyết toán theo phán quyết khiếu nại. Bạn được hoàn ${formatCurrency(ruling.renterAmount)} vào ví, tổng chi thực tế ${formatCurrency(totalActualCost)}.`
        : `Đơn thuê đã quyết toán xong. Bạn đã thanh toán ${formatCurrency(totalActualCost)} và nhận lại ${formatCurrency(depositRefunded)} tiền cọc.`;
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
      renterDescription =
        cancelSplit && cancelSplit.fee > 0
          ? `Đơn thuê đã bị huỷ sau khi thanh toán. Bạn được hoàn ${formatCurrency(cancelSplit.refund)} vào ví, phí huỷ ${formatCurrency(cancelSplit.fee)} được chuyển cho chủ đồ.`
          : `Đơn thuê đã bị huỷ sau khi thanh toán. Toàn bộ ${formatCurrency(cancelSplit?.refund ?? depositRefunded)} đã được hoàn lại vào ví của bạn.`;
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
    ...renterExtras,
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
  // What the platform actually keeps: 0 on a cancelled order, the ruling's share after a dispute
  let ownerPlatformFee = platformFee;
  const ownerExtras: Partial<OwnerFinancialItemsDto> = {};

  const grossRentalFee = rentalFee;

  if (order.status === 'PENDING' || order.status === 'ACCEPTED') {
    payoutStatus = 'WAITING_PAYMENT';
    lateCompensation = 0;
    netEarnings = Math.max(0, grossRentalFee - platformFee + lateCompensation);
  } else if (order.status === 'DISPUTING') {
    payoutStatus = 'DISPUTED';
    lateCompensation = lateFee;
    netEarnings = 0; // frozen in escrow pending resolution
  } else if (isCancelled) {
    const fee = cancelSplit?.fee ?? 0;
    payoutStatus = fee > 0 ? 'PAID_OUT' : 'CANCELLED';
    lateCompensation = 0;
    netEarnings = fee;
    ownerPlatformFee = 0;
    ownerExtras.cancelFee = fee;
  } else if (ruling) {
    payoutStatus = 'PAID_OUT';
    lateCompensation = lateFee;
    netEarnings = ruling.ownerAmount;
    ownerPlatformFee = ruling.platformFee;
    ownerExtras.compensation = ruling.compensationAmount;
    ownerExtras.rentRefund = ruling.rentRefundAmount;
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
      if (isCancelled) {
        ownerDescription = `Người thuê đã huỷ đơn sau khi thanh toán. Phí huỷ ${formatCurrency(netEarnings)} đã được chuyển vào ví của bạn.`;
      } else if (ruling) {
        ownerDescription = `Đơn thuê đã quyết toán theo phán quyết khiếu nại. ${formatCurrency(netEarnings)} đã được chuyển vào ví của bạn.`;
      } else {
        ownerDescription = `Đơn thuê đã quyết toán hoàn tất. Thu nhập ${formatCurrency(netEarnings)} đã được giải ngân vào ví của bạn.`;
      }
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
    platformFee: ownerPlatformFee,
    lateCompensation,
    netEarnings,
    ...ownerExtras,
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

  // Phí nền tảng chỉ vào ví platform khi quyết toán (postSettleLedger) hoặc theo phán quyết
  const platformRevenue = order.status === 'COMPLETED' ? ownerPlatformFee : 0;

  const adminItems: AdminFinancialItemsDto = {
    rentalFee,
    depositPaid,
    lateFee,
    depositRefunded,
    totalActualCost,
    grossRentalFee,
    platformFeeRate,
    platformFee: ownerPlatformFee,
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

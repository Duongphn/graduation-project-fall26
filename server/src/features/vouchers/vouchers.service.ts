import { AppError } from '../../shared/errors/app-error.js';
import Voucher, { type IVoucher } from './vouchers.model.js';

export interface ApplyRentalVoucherParams {
  code: string;
  rentalFee: number;
  depositAmount: number;
  orderType?: string;
  now?: Date;
}

export interface AppliedRentalVoucherResult {
  voucherId: string;
  voucherCode: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  originalRentalFee: number;
  discountAmount: number;
  finalRentalFee: number;
  depositAmount: number;
  totalAmount: number;
  applied: true;
}

/**
 * Validate and calculate rental voucher discount.
 * 
 * Rules:
 * 1. Only applies to RENTAL orders; purchase orders are strictly rejected.
 * 2. Only discounts rentalFee; depositAmount is 100% untouched.
 * 3. Discount cannot exceed rentalFee (finalRentalFee >= 0).
 * 4. When usedCount >= quantity, raises VOUCHER_USED_UP ("Used Up").
 */
export async function validateAndApplyRentalVoucher(
  params: ApplyRentalVoucherParams,
): Promise<AppliedRentalVoucherResult> {
  const { code, rentalFee, depositAmount, orderType = 'RENTAL', now = new Date() } = params;

  // 1. Ràng buộc: không dùng cho đơn mua
  if (orderType.toUpperCase() === 'PURCHASE' || orderType.toUpperCase() !== 'RENTAL') {
    throw new AppError(
      400,
      'INVALID_ORDER_TYPE',
      'Voucher này chỉ áp dụng cho đơn thuê đồ chơi, không dùng cho đơn mua.',
    );
  }

  // 2. Tìm voucher theo mã
  const voucher = await Voucher.findOne({ code: code.trim().toUpperCase() });
  if (!voucher) {
    throw new AppError(404, 'VOUCHER_NOT_FOUND', 'Mã voucher không tồn tại.');
  }

  // 3. Kiểm tra trạng thái "Used Up"
  if (voucher.status === 'used_up') {
    throw new AppError(400, 'VOUCHER_USED_UP', 'Used Up - Voucher đã hết lượt sử dụng.');
  }

  if (voucher.status !== 'active') {
    throw new AppError(
      400,
      'VOUCHER_INACTIVE',
      `Voucher không còn khả dụng (Trạng thái: ${voucher.status}).`,
    );
  }

  // 4. Kiểm tra thời hạn hiệu lực
  if (now < voucher.validFrom) {
    throw new AppError(400, 'VOUCHER_NOT_STARTED', 'Voucher chưa đến thời gian sử dụng.');
  }
  if (now > voucher.validTo) {
    throw new AppError(400, 'VOUCHER_EXPIRED', 'Voucher đã hết hạn sử dụng.');
  }

  // 5. Kiểm tra số lượt còn lại (hết lượt -> Used Up)
  if (voucher.usedCount >= voucher.quantity) {
    voucher.status = 'used_up';
    await voucher.save();
    throw new AppError(400, 'VOUCHER_USED_UP', 'Used Up - Voucher đã hết lượt sử dụng.');
  }

  // 6. Kiểm tra giá trị đơn hàng tối thiểu
  if (voucher.minOrderValue && rentalFee < voucher.minOrderValue) {
    throw new AppError(
      400,
      'MIN_ORDER_VALUE_NOT_MET',
      `Đơn thuê cần đạt tối thiểu ${voucher.minOrderValue.toLocaleString('vi-VN')} VND để áp dụng voucher này.`,
    );
  }

  // 7. Tính số tiền giảm giá: CHỈ GIẢM TIỀN THUÊ, KHÔNG GIẢM CỌC
  let rawDiscount = 0;
  if (voucher.discountType === 'percentage') {
    rawDiscount = (rentalFee * voucher.discountValue) / 100;
    if (voucher.maxDiscount && rawDiscount > voucher.maxDiscount) {
      rawDiscount = voucher.maxDiscount;
    }
  } else {
    rawDiscount = voucher.discountValue;
  }

  // Giảm tối đa bằng đúng tiền thuê (tiền thuê sau giảm không âm, không trừ sang tiền cọc)
  const discountAmount = Math.min(Math.round(rawDiscount), rentalFee);
  const finalRentalFee = rentalFee - discountAmount;
  const totalAmount = finalRentalFee + depositAmount;

  return {
    voucherId: voucher._id.toString(),
    voucherCode: voucher.code,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    originalRentalFee: rentalFee,
    discountAmount,
    finalRentalFee,
    depositAmount,
    totalAmount,
    applied: true,
  };
}

/**
 * Redeem voucher atomically when rental order payment is confirmed.
 */
export async function redeemRentalVoucher(voucherCode: string): Promise<IVoucher> {
  const voucher = await Voucher.findOneAndUpdate(
    {
      code: voucherCode.trim().toUpperCase(),
      status: 'active',
      $expr: { $lt: ['$usedCount', '$quantity'] },
    },
    {
      $inc: { usedCount: 1 },
    },
    { new: true },
  );

  if (!voucher) {
    throw new AppError(
      400,
      'VOUCHER_USED_UP',
      'Used Up - Voucher đã hết lượt sử dụng tại thời điểm thanh toán.',
    );
  }

  // Nếu đã đạt trần số lượng -> cập nhật sang used_up
  if (voucher.usedCount >= voucher.quantity) {
    voucher.status = 'used_up';
    await voucher.save();
  }

  return voucher;
}

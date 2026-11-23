import mongoose from 'mongoose';
import { AppError } from '../../shared/errors/app-error.js';
import PurchaseOrder from '../purchase_orders/purchase_orders.model.js';
import RentalOrder from '../rental_orders/rental_orders.model.js';
import Toy from '../toys/toys.model.js';
import User from '../users/users.model.js';
import Voucher, { type IVoucher } from './vouchers.model.js';
import type {
  CreateOwnerVoucherInput,
  UpdateOwnerVoucherInput,
} from './vouchers.validation.js';

export interface ApplyRentalVoucherParams {
  code: string;
  rentalFee: number;
  depositAmount: number;
  orderType?: string | undefined;
  toyId?: string | undefined;
  now?: Date | undefined;
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

export interface OwnerEligibilityResult {
  eligible: boolean;
  completedOrdersCount: number;
  rating: number;
}

/**
 * Kiểm tra điều kiện chỉ Owner có >= 10 đơn hoàn tất và điểm >= 4.5 mới được tạo/quản lý voucher.
 */
export async function checkOwnerVoucherEligibility(
  ownerId: string | mongoose.Types.ObjectId,
): Promise<OwnerEligibilityResult> {
  const objectId =
    typeof ownerId === 'string' ? new mongoose.Types.ObjectId(ownerId) : ownerId;

  // Đếm đơn hoàn tất: cả rental orders và purchase orders của chủ món đồ
  const rentalCount = await RentalOrder.countDocuments({
    ownerId: objectId,
    status: { $regex: /^completed$/i },
  });

  const purchaseCount = await PurchaseOrder.countDocuments({
    sellerId: objectId,
    status: { $regex: /^completed$/i },
  });

  const completedOrdersCount = rentalCount + purchaseCount;

  // Lấy điểm đánh giá của Owner (hỗ trợ rating field hoặc trust.score)
  const user: any = await User.findById(objectId).lean();
  let rating = 5.0; // Mặc định 5.0 nếu chưa có điểm
  if (user && !Array.isArray(user)) {
    if (typeof user.rating === 'number') {
      rating = user.rating;
    } else if (user.trust?.score !== undefined && user.trust.score !== null) {
      // Nếu thang điểm 100 thì quy đổi sang thang 5 (100 / 20 = 5)
      rating = user.trust.score > 5 ? Number((user.trust.score / 20).toFixed(1)) : user.trust.score;
    }
  }

  const eligible = completedOrdersCount >= 10 && rating >= 4.5;
  if (!eligible) {
    throw new AppError(
      403,
      'OWNER_NOT_ELIGIBLE',
      `Chỉ chủ đồ chơi có ít nhất 10 đơn hoàn tất (hiện có: ${completedOrdersCount}) và điểm đánh giá từ 4.5 trở lên (hiện có: ${rating.toFixed(1)}) mới được quyền tạo hoặc quản lý voucher.`,
      { completedOrdersCount, rating },
    );
  }

  return { eligible, completedOrdersCount, rating };
}

/**
 * Validate and calculate rental voucher discount.
 * 
 * Rules:
 * 1. Only applies to RENTAL orders; purchase orders are strictly rejected.
 * 2. Only discounts rentalFee; depositAmount is 100% untouched.
 * 3. Discount cannot exceed rentalFee (finalRentalFee >= 0).
 * 4. When usedCount >= quantity, raises VOUCHER_USED_UP ("Used Up").
 * 5. If applicableToyIds is set, checks if order toyId is included.
 */
export async function validateAndApplyRentalVoucher(
  params: ApplyRentalVoucherParams,
): Promise<AppliedRentalVoucherResult> {
  const { code, rentalFee, depositAmount, orderType = 'RENTAL', toyId, now = new Date() } = params;

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

  // 3. Kiểm tra trạng thái "Used Up" hoặc "Disabled"
  if (voucher.status === 'used_up') {
    throw new AppError(400, 'VOUCHER_USED_UP', 'Used Up - Voucher đã hết lượt sử dụng.');
  }

  if (voucher.status === 'disabled') {
    throw new AppError(400, 'VOUCHER_DISABLED', 'Voucher này đã bị chủ đồ chơi tạm tắt.');
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

  // 6. Kiểm tra tin đăng / món đồ chơi áp dụng (nếu có chỉ định)
  if (
    voucher.applicableToyIds &&
    voucher.applicableToyIds.length > 0 &&
    toyId
  ) {
    const isApplicable = voucher.applicableToyIds.some(
      (id) => id.toString() === toyId.toString(),
    );
    if (!isApplicable) {
      throw new AppError(
        400,
        'TOY_NOT_ELIGIBLE',
        'Mã voucher này không áp dụng cho món đồ chơi đang chọn.',
      );
    }
  }

  // 7. Kiểm tra giá trị đơn hàng tối thiểu
  if (voucher.minOrderValue && rentalFee < voucher.minOrderValue) {
    throw new AppError(
      400,
      'MIN_ORDER_VALUE_NOT_MET',
      `Đơn thuê cần đạt tối thiểu ${voucher.minOrderValue.toLocaleString('vi-VN')} VND để áp dụng voucher này.`,
    );
  }

  // 8. Tính số tiền giảm giá: CHỈ GIẢM TIỀN THUÊ, KHÔNG GIẢM CỌC
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

/**
 * Owner tạo mã voucher mới.
 */
export async function createOwnerVoucher(
  ownerId: string,
  input: CreateOwnerVoucherInput,
): Promise<IVoucher> {
  // 1. Kiểm tra điều kiện Owner: >= 10 đơn hoàn tất & điểm >= 4.5
  await checkOwnerVoucherEligibility(ownerId);

  // 2. Kiểm tra trùng mã
  const normalizedCode = input.code.trim().toUpperCase();
  const existing = await Voucher.findOne({ code: normalizedCode });
  if (existing) {
    throw new AppError(409, 'VOUCHER_EXISTS', 'Mã voucher này đã tồn tại, vui lòng chọn mã khác.');
  }

  // 3. Nếu có danh sách đồ chơi áp dụng, xác minh quyền sở hữu
  let applicableToyIds: mongoose.Types.ObjectId[] | undefined;
  if (input.applicableToyIds && input.applicableToyIds.length > 0) {
    const validObjectIds = input.applicableToyIds.map((id) => new mongoose.Types.ObjectId(id));
    const count = await Toy.countDocuments({
      _id: { $in: validObjectIds },
      ownerId: new mongoose.Types.ObjectId(ownerId),
    });
    if (count !== validObjectIds.length) {
      throw new AppError(
        400,
        'INVALID_APPLICABLE_TOYS',
        'Một số tin đăng đồ chơi không tồn tại hoặc không thuộc quyền sở hữu của bạn.',
      );
    }
    applicableToyIds = validObjectIds;
  }

  // 4. Tạo voucher
  const voucher = await Voucher.create({
    code: normalizedCode,
    ownerId: new mongoose.Types.ObjectId(ownerId),
    discountType: input.discountType,
    discountValue: input.discountValue,
    minOrderValue: input.minOrderValue ?? 0,
    maxDiscount: input.maxDiscount,
    quantity: input.quantity,
    usedCount: 0,
    validFrom: input.validFrom,
    validTo: input.validTo,
    applicableToyIds,
    status: 'active',
  });

  return voucher;
}

/**
 * Owner chỉnh sửa mã voucher.
 */
export async function updateOwnerVoucher(
  ownerId: string,
  voucherId: string,
  input: UpdateOwnerVoucherInput,
): Promise<IVoucher> {
  // 1. Kiểm tra điều kiện Owner
  await checkOwnerVoucherEligibility(ownerId);

  // 2. Tìm voucher theo ID và quyền sở hữu
  const voucher = await Voucher.findOne({
    _id: new mongoose.Types.ObjectId(voucherId),
    ownerId: new mongoose.Types.ObjectId(ownerId),
  });

  if (!voucher) {
    throw new AppError(
      404,
      'VOUCHER_NOT_FOUND',
      'Voucher không tồn tại hoặc bạn không có quyền chỉnh sửa voucher này.',
    );
  }

  // 3. Nếu sửa số lượng (quantity), không được nhỏ hơn số lượt đã dùng (usedCount)
  if (input.quantity !== undefined && input.quantity < voucher.usedCount) {
    throw new AppError(
      400,
      'INVALID_QUANTITY',
      `Số lượt phát hành mới (${input.quantity}) không thể nhỏ hơn số lượt đã sử dụng (${voucher.usedCount}).`,
    );
  }

  // 4. Nếu sửa danh sách đồ chơi áp dụng, xác minh quyền sở hữu
  if (input.applicableToyIds !== undefined) {
    if (input.applicableToyIds.length > 0) {
      const validObjectIds = input.applicableToyIds.map((id) => new mongoose.Types.ObjectId(id));
      const count = await Toy.countDocuments({
        _id: { $in: validObjectIds },
        ownerId: new mongoose.Types.ObjectId(ownerId),
      });
      if (count !== validObjectIds.length) {
        throw new AppError(
          400,
          'INVALID_APPLICABLE_TOYS',
          'Một số tin đăng đồ chơi không tồn tại hoặc không thuộc quyền sở hữu của bạn.',
        );
      }
      voucher.applicableToyIds = validObjectIds;
    } else {
      voucher.applicableToyIds = [];
    }
  }

  if (input.discountType !== undefined) voucher.discountType = input.discountType;
  if (input.discountValue !== undefined) voucher.discountValue = input.discountValue;
  if (input.minOrderValue !== undefined) voucher.minOrderValue = input.minOrderValue;
  if (input.maxDiscount !== undefined) voucher.maxDiscount = input.maxDiscount;
  if (input.quantity !== undefined) {
    voucher.quantity = input.quantity;
    // Nếu tăng số lượng vượt usedCount và trạng thái đang used_up thì có thể mở lại active
    if (voucher.status === 'used_up' && voucher.quantity > voucher.usedCount) {
      voucher.status = 'active';
    }
  }
  if (input.validFrom !== undefined) voucher.validFrom = input.validFrom;
  if (input.validTo !== undefined) voucher.validTo = input.validTo;
  if (input.status !== undefined) voucher.status = input.status;

  await voucher.save();
  return voucher;
}

/**
 * Owner tắt mã voucher (chuyển status thành disabled).
 */
export async function disableOwnerVoucher(
  ownerId: string,
  voucherId: string,
): Promise<IVoucher> {
  await checkOwnerVoucherEligibility(ownerId);

  const voucher = await Voucher.findOne({
    _id: new mongoose.Types.ObjectId(voucherId),
    ownerId: new mongoose.Types.ObjectId(ownerId),
  });

  if (!voucher) {
    throw new AppError(
      404,
      'VOUCHER_NOT_FOUND',
      'Voucher không tồn tại hoặc bạn không có quyền thao tác trên voucher này.',
    );
  }

  voucher.status = 'disabled';
  await voucher.save();
  return voucher;
}

/**
 * Danh sách các voucher do Owner tạo.
 */
export async function listOwnerVouchers(ownerId: string): Promise<IVoucher[]> {
  await checkOwnerVoucherEligibility(ownerId);

  return Voucher.find({ ownerId: new mongoose.Types.ObjectId(ownerId) }).sort({ createdAt: -1 });
}

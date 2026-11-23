import { Router } from 'express';
import { requireActor } from '../../shared/middleware/require-actor.js';
import {
  checkOwnerVoucherEligibility,
  createOwnerVoucher,
  disableOwnerVoucher,
  listOwnerVouchers,
  updateOwnerVoucher,
  validateAndApplyRentalVoucher,
} from './vouchers.service.js';
import {
  applyRentalVoucherSchema,
  createOwnerVoucherSchema,
  updateOwnerVoucherSchema,
} from './vouchers.validation.js';

export const vouchersRouter = Router();

/**
 * POST /api/v1/vouchers/apply
 * Áp dụng voucher khi thanh toán đơn thuê đồ chơi (UC09, UC36).
 * Quy tắc:
 * - Chỉ giảm tiền thuê (rentalFee), không giảm tiền cọc (depositAmount)
 * - Không dùng cho đơn mua (orderType === 'PURCHASE' -> lỗi INVALID_ORDER_TYPE)
 * - Khi hết lượt (usedCount >= quantity) -> lỗi VOUCHER_USED_UP ("Used Up")
 */
vouchersRouter.post('/apply', async (req, res, next) => {
  try {
    const input = applyRentalVoucherSchema.parse(req.body);
    const result = await validateAndApplyRentalVoucher(input);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Áp dụng voucher thành công. Đã giảm tiền thuê, tiền cọc giữ nguyên 100%.',
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// CÁC ROUTE OWNER QUẢN LÝ VOUCHER (Yêu cầu đăng nhập Actor)
// ==========================================

/**
 * GET /api/v1/vouchers/owner/eligibility
 * Kiểm tra xem Owner hiện tại có đủ điều kiện quản lý voucher (>= 10 đơn hoàn tất & điểm >= 4.5) hay không.
 */
vouchersRouter.get('/owner/eligibility', requireActor, async (req, res, next) => {
  try {
    const ownerId = req.auth!.userId;
    const result = await checkOwnerVoucherEligibility(ownerId);

    res.status(200).json({
      success: true,
      data: result,
      message: 'Bạn đủ điều kiện để tạo và quản lý mã voucher.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/vouchers/owner/mine
 * Danh sách toàn bộ voucher do chính Owner này tạo.
 */
vouchersRouter.get('/owner/mine', requireActor, async (req, res, next) => {
  try {
    const ownerId = req.auth!.userId;
    const items = await listOwnerVouchers(ownerId);

    res.status(200).json({
      success: true,
      data: items,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/vouchers/owner
 * Owner tạo mã voucher mới:
 * - Mã 4-20 ký tự
 * - % hoặc số tiền cố định
 * - Số lượt phát hành
 * - Thời hạn bắt đầu & kết thúc
 * - Tin đăng đồ chơi áp dụng
 * - Chỉ Owner có >= 10 đơn hoàn tất và điểm >= 4.5 mới được tạo
 */
vouchersRouter.post('/owner', requireActor, async (req, res, next) => {
  try {
    const ownerId = req.auth!.userId;
    const input = createOwnerVoucherSchema.parse(req.body);
    const voucher = await createOwnerVoucher(ownerId, input);

    res.status(201).json({
      success: true,
      data: voucher,
      message: 'Tạo mã voucher thành công.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/vouchers/owner/:id
 * Owner chỉnh sửa voucher của mình.
 */
vouchersRouter.patch('/owner/:id', requireActor, async (req, res, next) => {
  try {
    const ownerId = req.auth!.userId;
    const voucherId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const input = updateOwnerVoucherSchema.parse(req.body);
    const updated = await updateOwnerVoucher(ownerId, voucherId!, input);

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Cập nhật voucher thành công.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/vouchers/owner/:id/disable
 * Owner tắt mã voucher (chuyển status thành disabled).
 */
vouchersRouter.post('/owner/:id/disable', requireActor, async (req, res, next) => {
  try {
    const ownerId = req.auth!.userId;
    const voucherId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const disabled = await disableOwnerVoucher(ownerId, voucherId!);

    res.status(200).json({
      success: true,
      data: disabled,
      message: 'Đã tắt mã voucher thành công.',
    });
  } catch (err) {
    next(err);
  }
});

export default vouchersRouter;

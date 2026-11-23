import { Router } from 'express';
import { validateAndApplyRentalVoucher } from './vouchers.service.js';
import { applyRentalVoucherSchema } from './vouchers.validation.js';

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

export default vouchersRouter;

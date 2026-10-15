import { Router, type RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import '../../shared/contracts/request-actor.js';
import { PaymentsController } from './payments.controller.js';

/**
 * Middleware trích xuất actor từ Access Token nếu có trong header Authorization
 */
const optionalAuth: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, env.jwtAccessSecret) as { userId?: string };
      if (decoded?.userId) {
        req.auth = { userId: decoded.userId, actorType: 'USER' };
      }
    } catch {
      // Token không hợp lệ thì bỏ qua, để controller xử lý nếu thiếu thông tin
    }
  }
  next();
};

export function createPaymentsRouter(
  controller: PaymentsController = new PaymentsController(),
): Router {
  const router = Router();

  router.use(optionalAuth);

  // Tạo link thanh toán VietQR
  router.post('/create-link', controller.createPaymentLink);

  // Tra cứu đơn hàng và đồng bộ từ PayOS
  router.get('/order/:orderCode', controller.getPaymentByOrderCode);

  // Hủy link thanh toán
  router.post('/cancel/:orderCode', controller.cancelPayment);

  // Nhận thông báo tự động từ PayOS khi khách hàng quét mã chuyển tiền
  router.post('/payos-webhook', controller.handleWebhook);

  // Đăng ký webhook url với PayOS
  router.post('/confirm-webhook', controller.confirmWebhook);

  return router;
}

export const paymentsRouter = createPaymentsRouter();

import { Router } from 'express';
import { requireActor } from '../middlewares/require-actor.js';
import type { PaymentController } from '../controllers/payment.controller.js';

export function createPaymentRouter(controller: PaymentController): Router {
  const router = Router();

  // Khởi tạo nạp tiền ví (yêu cầu đăng nhập)
  router.post('/topup/vnpay', requireActor, controller.createTopup);

  // Return URL trình duyệt sau khi thanh toán xong trên VNPay (public)
  router.get('/vnpay-return', controller.handleVnpayReturn);

  // Webhook IPN Server-to-Server từ VNPay (public)
  router.get('/vnpay-ipn', controller.handleVnpayIpn);

  // Tra cứu trạng thái giao dịch nạp tiền
  router.get('/:code/status', controller.getPaymentStatus);

  return router;
}


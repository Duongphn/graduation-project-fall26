import { Router } from 'express';
import { requireActor } from '../middlewares/require-actor.js';
import { requireRoles } from '../middlewares/require-roles.js';
import { WalletController } from '../controllers/wallet.controller.js';
import type { WalletService } from '../services/wallet.service.js';
import type { PaymentController } from '../controllers/payment.controller.js';

export function createWalletRouter(
  service: WalletService,
  controller: WalletController = new WalletController(service),
  paymentController?: PaymentController,
): Router {
  const router = Router();

  // Route cho người dùng: xem ví cá nhân & lịch sử giao dịch
  router.get('/me', requireActor, controller.getMyWallet);
  router.get('/me/transactions', requireActor, controller.getMyTransactions);

  // Khởi tạo nạp tiền ví qua VNPay (yêu cầu đăng nhập)
  if (paymentController) {
    router.post('/topup/vnpay', requireActor, paymentController.createTopup);
  }

  // Route cho Quản trị viên: xem ví hệ thống (escrow, platform_fee, platform)
  router.get('/system/:ownerType', requireRoles('ADMIN'), controller.getSystemWallet);

  return router;
}

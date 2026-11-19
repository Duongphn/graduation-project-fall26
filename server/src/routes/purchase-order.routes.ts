import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { PurchaseOrderController } from '../controllers/purchase-order.controller.js';
import { type PurchaseOrderService } from '../services/purchase-order.service.js';

export function createPurchaseOrderRouter(service: PurchaseOrderService): Router {
  const router = Router();
  const controller = new PurchaseOrderController(service);

  // Báo giá trước khi mua (tính giá món, phí vận chuyển)
  router.post('/quote', controller.quote);

  // Mua ngay bằng ví ToyFlow (khóa tin, trừ ví vào Escrow, chuyển sang PAID)
  router.post('/buy-now', authenticate, requireActor, controller.buyNow);

  // Danh sách đơn tôi đã mua
  router.get('/mine', authenticate, requireActor, controller.listMine);

  // Danh sách đơn tôi đã bán
  router.get('/sold', authenticate, requireActor, controller.listSold);

  // Xem chi tiết đơn mua
  router.get('/:orderId', authenticate, requireActor, controller.getDetail);

  return router;
}

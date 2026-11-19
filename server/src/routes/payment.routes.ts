import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { validateRequest } from '../middlewares/validate.js';
import type { PaymentService } from '../services/payment.service.js';
import type { PayosTopupService } from '../services/payos-topup.service.js';
import {
  paymentCodeParamsSchema,
  payosCodeParamsSchema,
  payosReturnQuerySchema,
  payosTopupBodySchema,
  topupBodySchema,
} from '../validations/payment.validation.js';

/** Mounted at /api/v1/payments (VNPay paths are the same as the lead's API) */
export function createPaymentRouter(service: PaymentService, payos: PayosTopupService): Router {
  const router = Router();
  const controller = new PaymentController(service, payos);

  router.post(
    '/topup/vnpay',
    authenticate,
    requireActor,
    validateRequest({ body: topupBodySchema }),
    controller.createTopup,
  );
  // Public: VNPay's checksum proves the query, there is no user token on these calls
  router.get('/vnpay-return', controller.handleReturn);
  router.get('/vnpay-ipn', controller.handleIpn);

  // PayOS: bank transfer by VietQR (real money)
  router.post(
    '/topup/payos',
    authenticate,
    requireActor,
    validateRequest({ body: payosTopupBodySchema }),
    controller.createPayosTopup,
  );
  router.get(
    '/payos-return',
    authenticate,
    requireActor,
    validateRequest({ query: payosReturnQuerySchema }),
    controller.handlePayosReturn,
  );
  router.get(
    '/payos/:code',
    authenticate,
    requireActor,
    validateRequest({ params: payosCodeParamsSchema }),
    controller.getPayosCheckout,
  );
  router.post(
    '/payos/:code/cancel',
    authenticate,
    requireActor,
    validateRequest({ params: payosCodeParamsSchema }),
    controller.cancelPayosTopup,
  );
  // Public: the SDK checks PayOS's signature with the checksum key
  router.post('/payos-webhook', controller.handlePayosWebhook);
  router.get(
    '/:code/status',
    authenticate,
    requireActor,
    validateRequest({ params: paymentCodeParamsSchema }),
    controller.getStatus,
  );

  return router;
}

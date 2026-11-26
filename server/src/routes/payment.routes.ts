import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { validateRequest } from '../middlewares/validate.js';
import type { PayosTopupService } from '../services/payos-topup.service.js';
import {
  payosCodeParamsSchema,
  payosReturnQuerySchema,
  payosTopupBodySchema,
} from '../validations/payment.validation.js';

/** Mounted at /api/v1/payments: UC17 top-up by bank transfer (VietQR) through PayOS, real money */
export function createPaymentRouter(payos: PayosTopupService): Router {
  const router = Router();
  const controller = new PaymentController(payos);

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

  return router;
}

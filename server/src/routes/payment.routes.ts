import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { validateRequest } from '../middlewares/validate.js';
import type { PaymentService } from '../services/payment.service.js';
import { paymentCodeParamsSchema, topupBodySchema } from '../validations/payment.validation.js';

/** Mounted at /api/v1/payments (same paths as the lead's API) */
export function createPaymentRouter(service: PaymentService): Router {
  const router = Router();
  const controller = new PaymentController(service);

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
  router.get(
    '/:code/status',
    authenticate,
    requireActor,
    validateRequest({ params: paymentCodeParamsSchema }),
    controller.getStatus,
  );

  return router;
}

import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller.js';
import { WithdrawalController } from '../controllers/withdrawal.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { validateRequest } from '../middlewares/validate.js';
import { type WalletService } from '../services/wallet.service.js';
import { type WithdrawalService } from '../services/withdrawal.service.js';
import {
  walletTransactionListQuerySchema,
  withdrawalBodySchema,
  withdrawalListQuerySchema,
} from '../validations/wallet.validation.js';

export function createWalletRouter(service: WalletService, withdrawalService: WithdrawalService): Router {
  const router = Router();
  const controller = new WalletController(service);
  const withdrawals = new WithdrawalController(withdrawalService);

  router.get('/wallets/me', authenticate, requireActor, controller.getMyWallet);
  router.get(
    '/wallets/me/transactions',
    authenticate,
    requireActor,
    validateRequest({ query: walletTransactionListQuerySchema }),
    controller.listMyTransactions,
  );
  // UC18 Request withdrawal (same paths as the lead's API)
  router.post(
    '/wallets/withdrawals',
    authenticate,
    requireActor,
    validateRequest({ body: withdrawalBodySchema }),
    withdrawals.create,
  );
  router.get(
    '/wallets/withdrawals',
    authenticate,
    requireActor,
    validateRequest({ query: withdrawalListQuerySchema }),
    withdrawals.listMine,
  );
  router.post(
    '/admin/wallets/:userId/credit',
    authenticate,
    requireAdmin,
    controller.adminCredit,
  );

  return router;
}

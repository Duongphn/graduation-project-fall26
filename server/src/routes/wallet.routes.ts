import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { requireActor } from '../middlewares/require-actor.js';
import { requireAdmin } from '../middlewares/require-admin.js';
import { type WalletService } from '../services/wallet.service.js';

export function createWalletRouter(service: WalletService): Router {
  const router = Router();
  const controller = new WalletController(service);

  router.get('/wallets/me', authenticate, requireActor, controller.getMyWallet);
  router.post(
    '/admin/wallets/:userId/credit',
    authenticate,
    requireAdmin,
    controller.adminCredit,
  );

  return router;
}

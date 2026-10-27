import { Router } from 'express';
import type { Container } from '../container.js';
import { authenticate } from '../middlewares/authenticate.js';
import { createAuthRouter } from './auth.routes.js';
import { categoriesRouter } from './category.routes.js';
import { healthRouter } from './health.routes.js';
import { createIdentityVerificationRouter } from './identity-verification.routes.js';
import { createRentalOrderRouter } from './rental-order.routes.js';
import { createToyCatalogRouter } from './toy-catalog.routes.js';
import { createToyListingRouter } from './toy-listing.routes.js';
import { createUsersRouter } from './user.routes.js';
import { createWalletRouter } from './wallet.routes.js';

export function createApiRouter(container: Container): Router {
  const router = Router();

  router.use(healthRouter);
  router.use(createAuthRouter(container.authService));
  router.use('/categories', categoriesRouter);

  // Thứ tự quan trọng: router đăng tin đứng trước router công khai để /toys/mine không bị
  // hiểu là GET /toys/:toyId. Router đăng tin chỉ gắn requireActor trên từng route,
  // nên khách vẫn đi tiếp tới GET /toys, /toys/showcase, /toys/:toyId… mà không cần đăng nhập.
  router.use('/toys', createToyListingRouter(container.toyListingService));
  router.use('/toys', createToyCatalogRouter(container.toyCatalogService));

  router.use('/users', authenticate, createUsersRouter(container.usersService));
  router.use(
    '/identity-verifications',
    authenticate,
    createIdentityVerificationRouter(container.identityVerificationService),
  );

  router.use(createWalletRouter(container.walletService));
  router.use('/rentals', createRentalOrderRouter(container.rentalOrderService));

  return router;
}

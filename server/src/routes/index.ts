import { Router } from 'express';
import type { Container } from '../container.js';
import { featureEnv } from '../config/feature-env.js';
import { createDocsRouter } from '../config/openapi.js';
import { authenticate } from '../middlewares/authenticate.js';
import { adminCategoriesRouter } from './category-admin.routes.js';
import { createDonationPostsRouter } from './donation-post.routes.js';
import {
  adminDonationRequestsRouter,
  donationRequestsRouter,
  donorProfileRouter,
} from './donation-request.routes.js';
import './health.openapi.js';
import { adminIdentityReviewRouter } from './identity-review.routes.js';
import { notificationsRouter } from './notification.routes.js';
import { adminOrganizationsRouter, organizationsRouter } from './organization.routes.js';
import { adminToyModerationRouter } from './toy-moderation.routes.js';
import { uploadsRouter } from './upload.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { categoriesRouter } from './category.routes.js';
import { healthRouter } from './health.routes.js';
import { createIdentityVerificationRouter } from './identity-verification.routes.js';
import { createToyCatalogRouter } from './toy-catalog.routes.js';
import { createToyListingRouter } from './toy-listing.routes.js';
import { createUsersRouter } from './user.routes.js';

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

  // Admin back office and charity donations (each router checks requireActor / requireAdmin).
  router.use('/admin/categories', authenticate, adminCategoriesRouter);
  router.use('/admin/organizations', authenticate, adminOrganizationsRouter);
  router.use('/admin/toys', authenticate, adminToyModerationRouter);
  router.use('/admin/identity-verifications', authenticate, adminIdentityReviewRouter);
  router.use('/admin/donation-requests', authenticate, adminDonationRequestsRouter);
  router.use('/organizations', organizationsRouter);
  router.use('/notifications', authenticate, notificationsRouter);
  router.use('/donation-requests', authenticate, donationRequestsRouter);
  router.use(
    '/donation-posts',
    authenticate,
    createDonationPostsRouter(container.toyImageStorage),
  );
  router.use('/donors', donorProfileRouter);
  router.use('/uploads', authenticate, uploadsRouter);

  // Swagger UI and the OpenAPI JSON of the documented routes (never in production).
  if (featureEnv.docsEnabled) {
    router.use('/docs', createDocsRouter());
  }

  return router;
}

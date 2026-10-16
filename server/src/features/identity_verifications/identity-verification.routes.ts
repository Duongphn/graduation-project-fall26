import { Router } from 'express';
import { requireActor } from '../../shared/middleware/require-actor.js';
import { requireAdmin } from '../../shared/middleware/require-admin.js';
import { identityVerificationUpload } from './identity-verification-upload.js';
import { IdentityVerificationController } from './identity-verification.controller.js';
import type { IdentityVerificationService } from './identity-verification.service.js';

export function createIdentityVerificationRouter(
  service: IdentityVerificationService,
  controller: IdentityVerificationController = new IdentityVerificationController(service),
): Router {
  const router = Router();

  // User endpoints
  router.post('/', requireActor, identityVerificationUpload, controller.submit);
  router.get('/my-latest', requireActor, controller.getLatest);

  // Admin endpoints
  router.get('/', requireAdmin, controller.listQueue);
  router.get('/:id', requireAdmin, controller.getAdminDetail);
  router.patch('/:id/review', requireAdmin, controller.review);

  return router;
}

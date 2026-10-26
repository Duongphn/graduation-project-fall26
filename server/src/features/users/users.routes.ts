import { Router } from 'express';
import { requireActor } from '../../middlewares/require-actor.js';
import { userAvatarUpload } from '../../middlewares/upload.middleware.js';
import { UsersController } from './users.controller.js';
import type { UsersService } from './users.service.js';

export function createUsersRouter(
  service: UsersService,
  controller: UsersController = new UsersController(service),
): Router {
  const router = Router();

  router.use(requireActor);

  router.get('/profile', controller.getProfile);
  router.patch('/profile', controller.updateProfile);
  router.post('/avatar', userAvatarUpload, controller.uploadAvatar);

  return router;
}

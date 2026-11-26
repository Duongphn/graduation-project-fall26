import { Router } from 'express';
import { requireActor } from '../middlewares/require-actor.js';
import { userAvatarUpload } from '../middlewares/upload.middleware.js';
import { AddressController } from '../controllers/address.controller.js';
import { UsersController } from '../controllers/user.controller.js';
import { AddressService } from '../services/address.service.js';
import type { UsersService } from '../services/user.service.js';

export function createUsersRouter(
  service: UsersService,
  addressService: AddressService = new AddressService(),
  controller: UsersController = new UsersController(service),
  addressController: AddressController = new AddressController(addressService),
): Router {
  const router = Router();

  router.use(requireActor);

  router.get('/profile', controller.getProfile);
  router.patch('/profile', controller.updateProfile);
  router.post('/avatar', userAvatarUpload, controller.uploadAvatar);

  // Sổ địa chỉ giao nhận (UC03)
  router.get('/addresses', addressController.list);
  router.post('/addresses', addressController.create);
  router.patch('/addresses/:addressId', addressController.update);
  router.delete('/addresses/:addressId', addressController.remove);

  return router;
}

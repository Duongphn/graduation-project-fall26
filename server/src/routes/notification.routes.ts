import { Router } from 'express';

import { emptyObjectSchema, idParamsSchema } from '../validations/common.validation.js';
import { validateRequest } from '../middlewares/validate.js';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../controllers/notification.controller.js';
import './notification.openapi.js';
import { requireSignedIn } from '../middlewares/notification.guard.js';
import { listNotificationsQuerySchema } from '../validations/notification.validation.js';

// Mounted at /api/v1/notifications behind develop's `authenticate` (app/router.ts). Every route acts on the signed-in user's own notifications.
export const notificationsRouter = Router();

notificationsRouter.use(requireSignedIn);

notificationsRouter.get(
  '/',
  validateRequest({ query: listNotificationsQuerySchema }),
  listNotifications,
);
notificationsRouter.get(
  '/unread-count',
  validateRequest({ query: emptyObjectSchema }),
  getUnreadCount,
);
notificationsRouter.patch('/read-all', markAllNotificationsRead);
notificationsRouter.patch(
  '/:id/read',
  validateRequest({ params: idParamsSchema }),
  markNotificationRead,
);

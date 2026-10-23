import { Router } from 'express';

import { emptyObjectSchema, idParamsSchema } from '../../shared/http/schemas.js';
import { validateRequest } from '../../shared/middleware/validate.js';
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications.controller.js';
import './notifications.openapi.js';
import { requireSignedIn } from './notifications.guard.js';
import { listNotificationsQuerySchema } from './notifications.schemas.js';

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

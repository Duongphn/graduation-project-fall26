import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQueryWithSort,
} from '../../shared/http/schemas.js';
import { z } from '../../shared/validation/zod.js';
import { notificationTypes } from './notification-types.js';

export const notificationSortFields = ['createdAt'] as const;

export const listNotificationsQuerySchema = paginationQueryWithSort(notificationSortFields)
  .extend({
    unreadOnly: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true')
      .openapi({ description: 'true: only unread notifications.', example: 'true' }),
  })
  .strict();
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

export const notificationSchema = z
  .object({
    id: objectIdSchema,
    type: z.enum(notificationTypes).openapi({ example: 'TOY_REVIEWED' }),
    title: z.string().openapi({ example: 'Tin đăng "Xe điều khiển" chưa được duyệt' }),
    body: z.string(),
    isRead: z.boolean(),
    createdAt: isoDateTimeSchema,
  })
  .openapi('Notification');
export type NotificationDto = z.infer<typeof notificationSchema>;

export const unreadCountSchema = z.object({ count: z.number().int().openapi({ example: 3 }) });

export const markAllReadResultSchema = z.object({
  updatedCount: z.number().int().openapi({ example: 3 }),
});

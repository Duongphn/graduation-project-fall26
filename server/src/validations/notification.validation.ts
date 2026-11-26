import { isoDateTimeSchema, objectIdSchema, paginationQueryWithSort } from './common.validation.js';
import { z } from './zod.js';
import { notificationTypes } from '../constants/notification-types.js';

export const notificationTypeSchema = z.enum(notificationTypes);

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
    type: notificationTypeSchema.openapi({ example: 'TOY_REVIEWED' }),
    title: z.string().openapi({ example: 'Tin đăng "Xe điều khiển" chưa được duyệt' }),
    body: z.string(),
    link: z
      .string()
      .nullable()
      .openapi({
        description: 'Trang của web app mà thông báo mở ra.',
        example: '/listings/67098e1b34e12c001a123456/edit',
      }),
    isRead: z.boolean(),
    createdAt: isoDateTimeSchema,
  })
  .openapi('Notification');
export type NotificationDto = z.infer<typeof notificationSchema>;

export const unreadCountSchema = z.object({ count: z.number().int().openapi({ example: 3 }) });

export const markAllReadResultSchema = z.object({
  updatedCount: z.number().int().openapi({ example: 3 }),
});

export const notificationPreferencesSchema = z
  .object({
    types: z.array(
      z.object({
        type: notificationTypeSchema,
        canMute: z
          .boolean()
          .openapi({ description: 'false: thông báo quan trọng, luôn được gửi.' }),
        muted: z.boolean(),
        email: z.boolean().openapi({ description: 'Có gửi kèm email.' }),
      }),
    ),
  })
  .openapi('NotificationPreferences');
export type NotificationPreferencesDto = z.infer<typeof notificationPreferencesSchema>;

export const updateNotificationPreferencesSchema = z
  .object({
    mutedTypes: z
      .array(notificationTypeSchema)
      .max(notificationTypes.length)
      .openapi({
        description: 'Các loại thông báo muốn tắt (thay cho danh sách cũ).',
        example: ['CHAT_MESSAGE'],
      }),
  })
  .strict();
export type UpdateNotificationPreferencesBody = z.infer<typeof updateNotificationPreferencesSchema>;

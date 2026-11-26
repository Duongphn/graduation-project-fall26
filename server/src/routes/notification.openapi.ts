import {
  bearerAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../config/openapi.js';
import {
  idParamsSchema,
  paginatedResponseSchema,
  successResponseSchema,
} from '../validations/common.validation.js';
import {
  listNotificationsQuerySchema,
  markAllReadResultSchema,
  notificationPreferencesSchema,
  notificationSchema,
  unreadCountSchema,
  updateNotificationPreferencesSchema,
} from '../validations/notification.validation.js';

const tags = ['Notifications'];
const security = bearerAuthSecurity;

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/notifications',
  tags,
  security,
  summary: 'Thông báo của tôi (mới nhất trước)',
  request: { query: listNotificationsQuerySchema },
  responses: {
    200: {
      description: 'Danh sách thông báo phân trang',
      content: jsonContent(paginatedResponseSchema(notificationSchema)),
    },
    ...errorResponses(400, 401),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/notifications/unread-count',
  tags,
  security,
  summary: 'Số thông báo chưa đọc của tôi',
  responses: {
    200: {
      description: 'Số thông báo chưa đọc',
      content: jsonContent(successResponseSchema(unreadCountSchema)),
    },
    ...errorResponses(401),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/v1/notifications/read-all',
  tags,
  security,
  summary: 'Đánh dấu tất cả thông báo của tôi là đã đọc',
  responses: {
    200: {
      description: 'Số thông báo vừa được đánh dấu đã đọc',
      content: jsonContent(successResponseSchema(markAllReadResultSchema)),
    },
    ...errorResponses(401),
  },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: '/api/v1/notifications/{id}/read',
  tags,
  security,
  summary: 'Đánh dấu một thông báo của tôi là đã đọc',
  description: 'Gọi lại nhiều lần vẫn trả về thông báo đã đọc. Thông báo của người khác: 404.',
  request: { params: idParamsSchema },
  responses: {
    200: {
      description: 'Thông báo sau khi cập nhật',
      content: jsonContent(successResponseSchema(notificationSchema)),
    },
    ...errorResponses(400, 401, 404),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/notifications/preferences',
  tags,
  security,
  summary: 'Cài đặt thông báo của tôi (loại nào đang tắt)',
  responses: {
    200: {
      description: 'Mỗi loại thông báo: có được tắt không, đang tắt không, có gửi email không',
      content: jsonContent(successResponseSchema(notificationPreferencesSchema)),
    },
    ...errorResponses(401),
  },
});

openApiRegistry.registerPath({
  method: 'put',
  path: '/api/v1/notifications/preferences',
  tags,
  security,
  summary: 'Tắt thông báo theo loại',
  description:
    'Thay danh sách loại đang tắt. Chỉ tắt được loại có canMute = true; loại quan trọng: 400 NOTIFICATION_TYPE_NOT_MUTABLE.',
  request: {
    body: { required: true, content: jsonContent(updateNotificationPreferencesSchema) },
  },
  responses: {
    200: {
      description: 'Cài đặt sau khi lưu',
      content: jsonContent(successResponseSchema(notificationPreferencesSchema)),
    },
    ...errorResponses(400, 401),
  },
});

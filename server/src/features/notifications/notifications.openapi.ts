import {
  devAuthSecurity,
  errorResponses,
  jsonContent,
  openApiRegistry,
} from '../../infrastructure/docs/openapi.js';
import {
  idParamsSchema,
  paginatedResponseSchema,
  successResponseSchema,
} from '../../shared/http/schemas.js';
import {
  listNotificationsQuerySchema,
  markAllReadResultSchema,
  notificationSchema,
  unreadCountSchema,
} from './notifications.schemas.js';

const tags = ['Notifications'];
const security = devAuthSecurity;

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

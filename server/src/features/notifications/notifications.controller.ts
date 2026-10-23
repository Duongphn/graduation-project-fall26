import type { Request, Response } from 'express';

import type { IdParams } from '../../shared/http/schemas.js';
import { getRequestUserId } from '../../shared/http/admin-context.js';
import { getValidatedParams, getValidatedQuery } from '../../shared/middleware/validate.js';
import { sendPaginated, sendSuccess } from '../../shared/utils/response.js';
import type { ListNotificationsQuery } from './notifications.schemas.js';
import {
  countMyUnreadNotifications,
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from './notifications.service.js';

export const listNotifications = async (request: Request, response: Response): Promise<void> => {
  const query = getValidatedQuery<ListNotificationsQuery>(response);
  const { items, totalItems } = await listMyNotifications(getRequestUserId(request), query);
  sendPaginated(response, items, query, totalItems);
};

export const getUnreadCount = async (request: Request, response: Response): Promise<void> => {
  sendSuccess(response, await countMyUnreadNotifications(getRequestUserId(request)));
};

export const markNotificationRead = async (request: Request, response: Response): Promise<void> => {
  const { id } = getValidatedParams<IdParams>(response);
  sendSuccess(response, await markMyNotificationRead(getRequestUserId(request), id));
};

export const markAllNotificationsRead = async (
  request: Request,
  response: Response,
): Promise<void> => {
  sendSuccess(response, await markAllMyNotificationsRead(getRequestUserId(request)), {
    message: 'Đã đánh dấu tất cả thông báo là đã đọc.',
  });
};

import type { Request, Response } from 'express';

import type { IdParams } from '../validations/common.validation.js';
import { getRequestUserId } from '../utils/admin-context.js';
import { getValidatedParams, getValidatedQuery } from '../middlewares/validate.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import type { ListNotificationsQuery } from '../validations/notification.validation.js';
import {
  countMyUnreadNotifications,
  listMyNotifications,
  markAllMyNotificationsRead,
  markMyNotificationRead,
} from '../services/notification.service.js';

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

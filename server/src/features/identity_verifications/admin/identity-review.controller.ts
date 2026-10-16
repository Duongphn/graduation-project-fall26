import type { Request, Response } from 'express';

import { getAdminContext } from '../../../shared/http/admin-context.js';
import type { IdParams } from '../../../shared/http/schemas.js';
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../../shared/middleware/validate.js';
import { sendPaginated, sendSuccess } from '../../../shared/utils/response.js';
import type { IdentityQueueQuery, RejectIdentityBody } from './identity-review.schemas.js';
import * as service from './identity-review.service.js';

export const listQueue = async (_request: Request, response: Response) => {
  const query = getValidatedQuery<IdentityQueueQuery>(response);
  const { items, total } = await service.listQueue(query);
  sendPaginated(response, items, query, total);
};

export const counts = async (_request: Request, response: Response) => {
  sendSuccess(response, await service.countByStatus());
};

export const detail = async (request: Request, response: Response) => {
  const { id } = getValidatedParams<IdParams>(response);
  sendSuccess(response, await service.getDetail(id, getAdminContext(request)));
};

export const approve = async (request: Request, response: Response) => {
  const { id } = getValidatedParams<IdParams>(response);
  const result = await service.approve(id, getAdminContext(request));
  sendSuccess(response, result, { message: 'Đã xác minh danh tính người dùng.' });
};

// validateRequest has replaced the body with the parsed RejectIdentityBody.
export const reject = async (
  request: Request<Record<string, string>, unknown, RejectIdentityBody>,
  response: Response,
) => {
  const { id } = getValidatedParams<IdParams>(response);
  const result = await service.reject(
    id,
    getAdminContext(request),
    getValidatedBody<RejectIdentityBody>(request).reason,
  );
  sendSuccess(response, result, { message: 'Đã từ chối yêu cầu xác minh danh tính.' });
};

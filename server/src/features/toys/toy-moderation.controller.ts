import type { Request, Response } from 'express';

import { getAdminContext } from '../../shared/http/admin-context.js';
import type { IdParams } from '../../shared/http/schemas.js';
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../shared/middleware/validate.js';
import { sendPaginated, sendSuccess } from '../../shared/utils/response.js';
import type {
  ApproveToyBody,
  RejectToyBody,
  ToyModerationCountsQuery,
  ToyModerationQueueQuery,
} from './toy-moderation.schemas.js';
import * as service from './toy-moderation.service.js';

// GET /api/v1/admin/toys
export const listQueue = async (_request: Request, response: Response): Promise<void> => {
  const query = getValidatedQuery<ToyModerationQueueQuery>(response);
  const { items, totalItems } = await service.listQueue(query);
  sendPaginated(response, items, query, totalItems);
};

// GET /api/v1/admin/toys/counts
export const countByStatus = async (_request: Request, response: Response): Promise<void> => {
  sendSuccess(
    response,
    await service.countByStatus(getValidatedQuery<ToyModerationCountsQuery>(response)),
  );
};

// GET /api/v1/admin/toys/:id
export const getDetail = async (_request: Request, response: Response): Promise<void> => {
  const { id } = getValidatedParams<IdParams>(response);
  sendSuccess(response, await service.getDetail(id));
};

// POST /api/v1/admin/toys/:id/approve
export const approve = async (request: Request, response: Response): Promise<void> => {
  const { id } = getValidatedParams<IdParams>(response);
  const result = await service.approveToy(
    id,
    getValidatedBody<ApproveToyBody>(request),
    getAdminContext(request),
  );
  sendSuccess(response, result, { message: 'Đã duyệt tin đăng.' });
};

// POST /api/v1/admin/toys/:id/reject
export const reject = async (request: Request, response: Response): Promise<void> => {
  const { id } = getValidatedParams<IdParams>(response);
  const result = await service.rejectToy(
    id,
    getValidatedBody<RejectToyBody>(request),
    getAdminContext(request),
  );
  sendSuccess(response, result, { message: 'Đã từ chối tin đăng.' });
};

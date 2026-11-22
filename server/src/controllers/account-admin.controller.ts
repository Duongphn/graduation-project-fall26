import type { Request, Response } from 'express';

import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../middlewares/validate.js';
import * as service from '../services/account-admin.service.js';
import { getAdminContext } from '../utils/admin-context.js';
import { sendPaginated, sendSuccess } from '../utils/response.js';
import type {
  AccountCountsQuery,
  AccountListQuery,
  LockAccountBody,
  UnlockAccountBody,
} from '../validations/account-admin.validation.js';
import type { IdParams } from '../validations/common.validation.js';

// GET /api/v1/admin/users
export const list = async (_request: Request, response: Response): Promise<void> => {
  const query = getValidatedQuery<AccountListQuery>(response);
  const { items, totalItems } = await service.listAccounts(query);
  sendPaginated(response, items, query, totalItems);
};

// GET /api/v1/admin/users/counts
export const counts = async (_request: Request, response: Response): Promise<void> => {
  sendSuccess(response, await service.countAccounts(getValidatedQuery<AccountCountsQuery>(response)));
};

// GET /api/v1/admin/users/:id
export const detail = async (_request: Request, response: Response): Promise<void> => {
  const { id } = getValidatedParams<IdParams>(response);
  sendSuccess(response, await service.getAccountDetail(id));
};

// POST /api/v1/admin/users/:id/lock
export const lock = async (request: Request, response: Response): Promise<void> => {
  const { id } = getValidatedParams<IdParams>(response);
  const result = await service.lockAccount(
    id,
    getValidatedBody<LockAccountBody>(request),
    getAdminContext(request),
  );
  sendSuccess(response, result, { message: 'Đã khóa tài khoản.' });
};

// POST /api/v1/admin/users/:id/unlock
export const unlock = async (request: Request, response: Response): Promise<void> => {
  const { id } = getValidatedParams<IdParams>(response);
  const result = await service.unlockAccount(
    id,
    getValidatedBody<UnlockAccountBody>(request),
    getAdminContext(request),
  );
  sendSuccess(response, result, { message: 'Đã mở khóa tài khoản.' });
};

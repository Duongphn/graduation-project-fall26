import type { Request, Response } from 'express';

import { getAdminContext } from '../../shared/http/admin-context.js';
import type { IdParams } from '../../shared/http/schemas.js';
import {
  getValidatedBody,
  getValidatedParams,
  getValidatedQuery,
} from '../../shared/middleware/validate.js';
import { sendCreated, sendPaginated, sendSuccess } from '../../shared/utils/response.js';
import { visibilityChanges } from './categories.rules.js';
import type {
  AdminCategoryListQuery,
  CreateCategoryBody,
  ReorderCategoriesBody,
  UpdateCategoryBody,
} from './categories.schemas.js';
import {
  changeCategoryVisibility,
  createCategory,
  deleteCategory,
  listAdminCategories,
  reorderCategories,
  updateCategory,
} from './categories.service.js';

const categoryId = (response: Response): string => getValidatedParams<IdParams>(response).id;

export const listAdmin = async (_request: Request, response: Response): Promise<void> => {
  const query = getValidatedQuery<AdminCategoryListQuery>(response);
  const { items, total } = await listAdminCategories(query);
  sendPaginated(response, items, query, total);
};

export const create = async (request: Request, response: Response): Promise<void> => {
  const category = await createCategory(
    getValidatedBody<CreateCategoryBody>(request),
    getAdminContext(request),
  );
  sendCreated(response, category, 'Đã thêm danh mục.');
};

export const update = async (request: Request, response: Response): Promise<void> => {
  const category = await updateCategory(
    categoryId(response),
    getValidatedBody<UpdateCategoryBody>(request),
    getAdminContext(request),
  );
  sendSuccess(response, category, { message: 'Đã cập nhật danh mục.' });
};

export const hide = async (request: Request, response: Response): Promise<void> => {
  const category = await changeCategoryVisibility(
    categoryId(response),
    'hidden',
    getAdminContext(request),
  );
  sendSuccess(response, category, { message: visibilityChanges.hidden.message });
};

export const show = async (request: Request, response: Response): Promise<void> => {
  const category = await changeCategoryVisibility(
    categoryId(response),
    'active',
    getAdminContext(request),
  );
  sendSuccess(response, category, { message: visibilityChanges.active.message });
};

export const remove = async (request: Request, response: Response): Promise<void> => {
  await deleteCategory(categoryId(response), getAdminContext(request));
  sendSuccess(response, null, { message: 'Đã xoá danh mục.' });
};

export const reorder = async (request: Request, response: Response): Promise<void> => {
  await reorderCategories(
    getValidatedBody<ReorderCategoriesBody>(request),
    getAdminContext(request),
  );
  sendSuccess(response, null, { message: 'Đã cập nhật thứ tự danh mục.' });
};

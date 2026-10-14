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
import { z } from '../../shared/validation/zod.js';
import {
  adminCategoryListQuerySchema,
  adminCategorySchema,
  createCategoryBodySchema,
  publicCategorySchema,
  reorderCategoriesBodySchema,
  updateCategoryBodySchema,
} from './categories.schemas.js';

const ADMIN = '/api/v1/admin/categories';
const tags = ['Categories'];
const one = (description: string) => ({
  description,
  content: jsonContent(successResponseSchema(adminCategorySchema)),
});
const noData = (description: string) => ({
  description,
  content: jsonContent(successResponseSchema(z.null())),
});

openApiRegistry.registerPath({
  method: 'get',
  path: '/api/v1/categories',
  tags,
  summary: 'List the ACTIVE categories in menu order (public)',
  responses: {
    200: {
      description: 'Active categories',
      content: jsonContent(successResponseSchema(z.array(publicCategorySchema))),
    },
    ...errorResponses(400),
  },
});

openApiRegistry.registerPath({
  method: 'get',
  path: ADMIN,
  tags,
  summary: 'List categories with their toy count (Admin)',
  description: 'Always in menu order. limit defaults to 100, so one page usually holds them all.',
  security: devAuthSecurity,
  request: { query: adminCategoryListQuerySchema },
  responses: {
    200: {
      description: 'Categories',
      content: jsonContent(paginatedResponseSchema(adminCategorySchema)),
    },
    ...errorResponses(400, 401, 403),
  },
});

openApiRegistry.registerPath({
  method: 'post',
  path: ADMIN,
  tags,
  summary: 'Create a category (Admin)',
  description: 'The name is unique ignoring case (409 CATEGORY_NAME_TAKEN). The slug is derived.',
  security: devAuthSecurity,
  request: { body: { content: jsonContent(createCategoryBodySchema) } },
  responses: { 201: one('Created'), ...errorResponses(400, 401, 403, 409) },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: `${ADMIN}/reorder`,
  tags,
  summary: 'Set the display order (Admin)',
  description: 'displayOrder becomes 1, 2, 3... in the order of ids; others follow.',
  security: devAuthSecurity,
  request: { body: { content: jsonContent(reorderCategoriesBodySchema) } },
  responses: { 200: noData('Reordered'), ...errorResponses(400, 401, 403, 404) },
});

openApiRegistry.registerPath({
  method: 'patch',
  path: `${ADMIN}/{id}`,
  tags,
  summary: 'Edit a category (Admin)',
  description: 'The slug is kept on rename so shared links keep working.',
  security: devAuthSecurity,
  request: { params: idParamsSchema, body: { content: jsonContent(updateCategoryBodySchema) } },
  responses: { 200: one('Updated'), ...errorResponses(400, 401, 403, 404, 409) },
});

for (const [action, summary, code] of [
  ['hide', 'Hide a category (Admin)', 'CATEGORY_ALREADY_HIDDEN'],
  ['show', 'Show a hidden category again (Admin)', 'CATEGORY_ALREADY_VISIBLE'],
] as const) {
  openApiRegistry.registerPath({
    method: 'post',
    path: `${ADMIN}/{id}/${action}`,
    tags,
    summary,
    description: `409 ${code} when it is already in that state.`,
    security: devAuthSecurity,
    request: { params: idParamsSchema },
    responses: { 200: one('New state'), ...errorResponses(400, 401, 403, 404, 409) },
  });
}

openApiRegistry.registerPath({
  method: 'delete',
  path: `${ADMIN}/{id}`,
  tags,
  summary: 'Delete an unused category (Admin)',
  description: '409 CATEGORY_IN_USE while any toy points to it: hide it instead.',
  security: devAuthSecurity,
  request: { params: idParamsSchema },
  responses: { 200: noData('Deleted'), ...errorResponses(400, 401, 403, 404, 409) },
});

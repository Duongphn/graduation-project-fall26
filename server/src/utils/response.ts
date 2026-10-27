import type { Response } from 'express';

import type { PaginationQuery } from '../validations/common.validation.js';

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// Success envelope: { success: true, data, message? } (api-conventions.md §1).
export const sendSuccess = <T>(
  response: Response,
  data: T,
  options: { status?: number; message?: string } = {},
): void => {
  response.status(options.status ?? 200).json({
    success: true,
    data,
    ...(options.message ? { message: options.message } : {}),
  });
};

export const sendCreated = <T>(response: Response, data: T, message?: string): void =>
  sendSuccess(response, data, { status: 201, ...(message ? { message } : {}) });

export const buildPaginationMeta = (
  query: Pick<PaginationQuery, 'page' | 'limit'>,
  totalItems: number,
): PaginationMeta => {
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  return {
    page: query.page,
    limit: query.limit,
    totalItems,
    totalPages,
    hasNextPage: query.page < totalPages,
    hasPrevPage: query.page > 1,
  };
};

// Paginated envelope: { success: true, data: [...], pagination } (api-conventions.md §3).
export const sendPaginated = <T>(
  response: Response,
  items: T[],
  query: Pick<PaginationQuery, 'page' | 'limit'>,
  totalItems: number,
): void => {
  response.status(200).json({
    success: true,
    data: items,
    pagination: buildPaginationMeta(query, totalItems),
  });
};

/** MongoDB skip/limit of a page. */
export const toSkipLimit = (query: Pick<PaginationQuery, 'page' | 'limit'>) => ({
  skip: (query.page - 1) * query.limit,
  limit: query.limit,
});

// MongoDB skip/limit/sort for a pagination query. The list schema already restricts sortBy to
// its allowed fields (paginationQueryWithSort); the check here is a second guard, so clients
// cannot sort on unindexed or private fields. `_id` is a tie-breaker so pages never overlap.
export const toMongoPaging = (
  query: Pick<PaginationQuery, 'page' | 'limit' | 'sortOrder'> & { sortBy?: string | undefined },
  allowedSortFields: readonly string[],
  defaultSort = 'createdAt',
) => {
  const field =
    query.sortBy && allowedSortFields.includes(query.sortBy) ? query.sortBy : defaultSort;
  const direction = query.sortOrder === 'asc' ? 1 : -1;
  return {
    ...toSkipLimit(query),
    sort: { [field]: direction, ...(field === '_id' ? {} : { _id: direction }) } as Record<
      string,
      1 | -1
    >,
  };
};

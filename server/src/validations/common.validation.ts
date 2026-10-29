import { normalizeVietnamPhone } from '../utils/phone.js';
import { normalizeText } from '../utils/text.js';
import { z } from './zod.js';

// Shared request and response schemas (docs/api-conventions.md §1-§4).

export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, 'Must be a valid id.')
  .openapi({ example: '67098e1b34e12c001a123456' });

export const idParamsSchema = z.object({ id: objectIdSchema });
export type IdParams = z.infer<typeof idParamsSchema>;

/** For routes that take no query or body: unknown keys are rejected. */
export const emptyObjectSchema = z.object({}).strict();

export const MAX_PAGE_LIMIT = 100;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(10).openapi({ example: 10 }),
  sortBy: z.string().trim().min(1).max(50).optional().openapi({ example: 'createdAt' }),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * The pagination query of one list, with sortBy limited to that list's fields: another value is
 * a 400, and Swagger lists the allowed values.
 */
export const paginationQueryWithSort = <const T extends readonly [string, ...string[]]>(
  sortFields: T,
) =>
  paginationQuerySchema.extend({
    sortBy: z.enum(sortFields).optional().openapi({ example: sortFields[0] }),
  });

/** Optional free-text search, normalized (NFC, single spaces); empty means "no search". */
export const searchQuerySchema = z
  .string()
  .max(100)
  .transform(normalizeText)
  .optional()
  .openapi({ example: 'xe gỗ' });

export const paginationMetaSchema = z
  .object({
    page: z.number().int(),
    limit: z.number().int(),
    totalItems: z.number().int(),
    totalPages: z.number().int(),
    hasNextPage: z.boolean(),
    hasPrevPage: z.boolean(),
  })
  .openapi('PaginationMeta');

export const apiErrorSchema = z
  .object({
    success: z.literal(false),
    error: z.object({
      code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .openapi('ApiErrorResponse');

export const successResponseSchema = <T extends z.ZodType>(data: T) =>
  z.object({ success: z.literal(true), data, message: z.string().optional() });

export const paginatedResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({ success: z.literal(true), data: z.array(item), pagination: paginationMetaSchema });

/** ISO 8601 date-time in responses and stale-edit tokens (e.g. a toy's `updatedAt`). */
export const isoDateTimeSchema = z.iso.datetime({ offset: true }).openapi({
  example: '2026-10-12T08:00:00.000Z',
});

/** The reason an Admin must give when rejecting or hiding something. */
export const reasonSchema = z.string().trim().min(5).max(500).openapi({
  example: 'Ảnh chưa rõ, vui lòng chụp lại mặt sau CCCD.',
});

/** A Vietnamese mobile number, returned in E.164 form (+84...). */
export const vietnamPhoneSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    const phone = normalizeVietnamPhone(value);
    if (!phone) {
      context.addIssue({ code: 'custom', message: 'Số điện thoại không hợp lệ.' });
      return z.NEVER;
    }
    return phone;
  })
  .openapi({ type: 'string', example: '0912345678' });

/** A public image (toy photos, logos, avatars): the https URL Cloudinary returned. */
export const imageUrlSchema = z
  .url({ protocol: /^https$/ })
  .max(500)
  .openapi({ example: 'https://res.cloudinary.com/toyflow/image/upload/v1/toyflow/toys/a.jpg' });

/** A private image (identity documents, handovers, disputes) uploaded as "authenticated". */
export const privateImageInputSchema = z
  .object({
    publicId: z.string().trim().min(1).max(300),
    format: z
      .string()
      .trim()
      .regex(/^[a-z0-9]{2,5}$/i),
  })
  .openapi('PrivateImageInput');

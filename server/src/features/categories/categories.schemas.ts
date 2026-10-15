import { visibilityStatuses } from '../../shared/domain/statuses.js';
import {
  MAX_PAGE_LIMIT,
  isoDateTimeSchema,
  objectIdSchema,
  searchQuerySchema,
} from '../../shared/http/schemas.js';
import { normalizeText } from '../../shared/utils/text.js';
import { z } from '../../shared/validation/zod.js';

// Toy categories (UC30). Request schemas double as the Swagger documentation.

export const CATEGORY_NAME_MIN = 2;
export const CATEGORY_NAME_MAX = 100;
export const CATEGORY_DESCRIPTION_MAX = 500;
export const CATEGORY_DISPLAY_ORDER_MAX = 1_000_000;
export const MAX_REORDER_IDS = 500;

// NFC and single spaces; case is compared by the name_unique collation ({ vi, strength 2 }).
const categoryNameSchema = z
  .string({ error: 'Tên danh mục là bắt buộc.' })
  .overwrite(normalizeText)
  .min(CATEGORY_NAME_MIN, `Tên danh mục cần ít nhất ${CATEGORY_NAME_MIN} ký tự.`)
  .max(CATEGORY_NAME_MAX, `Tên danh mục tối đa ${CATEGORY_NAME_MAX} ký tự.`)
  .openapi({ example: 'Đồ chơi gỗ' });

const descriptionSchema = z
  .string()
  .overwrite((value) => value.normalize('NFC').trim())
  .max(CATEGORY_DESCRIPTION_MAX, `Mô tả tối đa ${CATEGORY_DESCRIPTION_MAX} ký tự.`)
  .openapi({ example: 'Đồ chơi bằng gỗ tự nhiên, an toàn cho trẻ nhỏ.' });

const displayOrderSchema = z
  .number()
  .int('Thứ tự hiển thị phải là số nguyên.')
  .min(0, 'Thứ tự hiển thị không được âm.')
  .max(CATEGORY_DISPLAY_ORDER_MAX, 'Thứ tự hiển thị quá lớn.')
  .openapi({ example: 11 });

export const createCategoryBodySchema = z
  .object({
    name: categoryNameSchema,
    description: descriptionSchema.optional(),
    // Omitted: the new category goes to the end of the list.
    displayOrder: displayOrderSchema.optional(),
  })
  .strict()
  .openapi('CreateCategoryRequest');
export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;

export const updateCategoryBodySchema = z
  .object({
    name: categoryNameSchema.optional(),
    // null or "" removes the description.
    description: descriptionSchema.nullable().optional(),
    displayOrder: displayOrderSchema.optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Cần ít nhất một trường để cập nhật (name, description hoặc displayOrder).',
  })
  .openapi('UpdateCategoryRequest');
export type UpdateCategoryBody = z.infer<typeof updateCategoryBodySchema>;

export const reorderCategoriesBodySchema = z
  .object({
    ids: z
      .array(objectIdSchema.transform((id) => id.toLowerCase()))
      .min(1, 'Cần ít nhất một danh mục.')
      .max(MAX_REORDER_IDS, `Tối đa ${MAX_REORDER_IDS} danh mục.`)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Danh sách có danh mục bị lặp.',
      })
      .describe('Every category id, in the new order (a partial list answers 422).'),
  })
  .strict()
  .openapi('ReorderCategoriesRequest');
export type ReorderCategoriesBody = z.infer<typeof reorderCategoriesBodySchema>;

// Always in menu order (displayOrder, then name), so there is no sortBy. The default limit is
// the maximum: an Admin normally sees every category on one page.
export const adminCategoryListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_LIMIT)
      .default(MAX_PAGE_LIMIT)
      .openapi({ example: MAX_PAGE_LIMIT }),
    status: z.enum(visibilityStatuses).optional().openapi({ example: 'ACTIVE' }),
    // Name or description, with or without accents ("dieu khien" matches "Điều khiển").
    q: searchQuerySchema,
  })
  .strict();
export type AdminCategoryListQuery = z.infer<typeof adminCategoryListQuerySchema>;

export const adminCategorySchema = z
  .object({
    id: objectIdSchema,
    name: z.string().openapi({ example: 'Đồ chơi gỗ' }),
    slug: z.string().openapi({ example: 'do-choi-go' }),
    description: z.string().optional(),
    displayOrder: z.number().int().openapi({ example: 11 }),
    status: z.enum(visibilityStatuses),
    // Every toy that points to the category, in any status.
    toyCount: z.number().int().openapi({ example: 3 }),
    // True only when no toy points to the category; otherwise it can only be hidden.
    canDelete: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .openapi('AdminCategory');
export type AdminCategoryView = z.infer<typeof adminCategorySchema>;

export const publicCategorySchema = z
  .object({
    id: objectIdSchema,
    name: z.string().openapi({ example: 'Lắp ráp & xếp hình' }),
    slug: z.string().openapi({ example: 'lap-rap-xep-hinh' }),
    description: z.string().optional(),
  })
  .openapi('PublicCategory');
export type PublicCategoryView = z.infer<typeof publicCategorySchema>;

import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQueryWithSort,
  searchQuerySchema,
} from './common.validation.js';
import { normalizeText } from '../utils/text.js';
import { z } from './zod.js';
import { organizationStatuses } from '../constants/organization-rules.js';

// Request and response schemas of the charity organization endpoints (FE-02, UC34).

const text = (min: number, max: number, message: string) =>
  z.string(message).transform(normalizeText).pipe(z.string().min(min, message).max(max, message));

const nameSchema = text(2, 150, 'Tên tổ chức cần từ 2 đến 150 ký tự.').openapi({
  example: 'Mái ấm Hoa Hồng',
});
const addressSchema = text(5, 300, 'Địa chỉ cần từ 5 đến 300 ký tự.').openapi({
  example: '123 Lê Văn Sỹ, Phường Nhiêu Lộc',
});
const contactInfoSchema = text(2, 300, 'Thông tin liên hệ cần từ 2 đến 300 ký tự.').openapi({
  example: 'Chị Lan, phụ trách tiếp nhận',
});
const supportCriteriaSchema = text(5, 1000, 'Tiêu chí hỗ trợ cần từ 5 đến 1000 ký tự.').openapi({
  example: 'Sách tranh, đồ chơi xếp hình, đồ chơi vận động còn dùng tốt.',
});
export const createOrganizationBodySchema = z
  .object({
    name: nameSchema,
    address: addressSchema,
    contactInfo: contactInfoSchema,
    supportCriteria: supportCriteriaSchema,
  })
  .strict()
  .openapi('CreateOrganizationRequest');
export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;

/** Every field is optional. */
export const updateOrganizationBodySchema = z
  .object({
    name: nameSchema.optional(),
    address: addressSchema.optional(),
    contactInfo: contactInfoSchema.optional(),
    supportCriteria: supportCriteriaSchema.optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: 'Cần ít nhất một trường để cập nhật.',
  })
  .openapi('UpdateOrganizationRequest');
export type UpdateOrganizationBody = z.infer<typeof updateOrganizationBodySchema>;

export const adminOrganizationSortFields = ['createdAt', 'updatedAt', 'name'] as const;
export const publicOrganizationSortFields = ['name', 'createdAt'] as const;

export const adminOrganizationListQuerySchema = paginationQueryWithSort(adminOrganizationSortFields)
  .extend({
    status: z.enum(organizationStatuses).optional(),
    q: searchQuerySchema,
  })
  .strict();
export type AdminOrganizationListQuery = z.infer<typeof adminOrganizationListQuerySchema>;

export const publicOrganizationListQuerySchema = paginationQueryWithSort(
  publicOrganizationSortFields,
)
  .extend({
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    q: searchQuerySchema,
  })
  .strict();
export type PublicOrganizationListQuery = z.infer<typeof publicOrganizationListQuerySchema>;

// Responses (Swagger only).
const sharedResponseFields = {
  id: objectIdSchema,
  name: z.string(),
  address: z.string(),
  contactInfo: z.string(),
  supportCriteria: z.string(),
};

export const publicOrganizationSchema = z
  .object(sharedResponseFields)
  .openapi('OrganizationPublic');

export const adminOrganizationSchema = z
  .object({
    ...sharedResponseFields,
    status: z.enum(organizationStatuses),
    openRequestCount: z.number().int().openapi({
      description: 'Donation requests still in progress (pending, accepted, shipping).',
    }),
    requestCount: z
      .number()
      .int()
      .openapi({ description: 'All donation requests ever sent to it (> 0: cannot be deleted).' }),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .openapi('OrganizationAdmin');

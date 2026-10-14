import { ageGroups } from '../../shared/domain/enums.js';
import { visibilityStatuses } from '../../shared/domain/statuses.js';
import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQueryWithSort,
  provinceSchema,
  searchQuerySchema,
  vietnamPhoneSchema,
} from '../../shared/http/schemas.js';
import { normalizeText } from '../../shared/utils/text.js';
import { z } from '../../shared/validation/zod.js';
import { isOrganizationLogoUrl } from './domain/organization-rules.js';

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
const descriptionSchema = text(1, 2000, 'Mô tả tối đa 2000 ký tự.').openapi({
  example: 'Nhà mở nuôi dưỡng 40 trẻ từ 3 đến 12 tuổi.',
});
const ageGroupsSchema = z
  .array(z.enum(ageGroups))
  .min(1, 'Chọn ít nhất một nhóm tuổi.')
  .max(ageGroups.length)
  .transform((values) => ageGroups.filter((group) => values.includes(group)))
  .openapi({ example: ['AGE_3_5', 'AGE_6_8'] });

/** The secure_url returned by a signed ORGANIZATION_LOGO upload (POST /uploads/signature). */
const logoUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => isOrganizationLogoUrl(value), {
    message: 'Logo phải là ảnh tải lên qua hệ thống (thư mục toyflow/organizations).',
  })
  .openapi({
    example: 'https://res.cloudinary.com/toyflow/image/upload/v1/toyflow/organizations/a.png',
  });

export const createOrganizationBodySchema = z
  .object({
    name: nameSchema,
    address: addressSchema,
    province: provinceSchema,
    phone: vietnamPhoneSchema,
    contactInfo: contactInfoSchema,
    supportCriteria: supportCriteriaSchema,
    ageGroups: ageGroupsSchema,
    description: descriptionSchema.optional(),
    logoUrl: logoUrlSchema.optional(),
  })
  .strict()
  .openapi('CreateOrganizationRequest');
export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;

/** Every field is optional; null clears `description` or `logoUrl`. */
export const updateOrganizationBodySchema = z
  .object({
    name: nameSchema.optional(),
    address: addressSchema.optional(),
    province: provinceSchema.optional(),
    phone: vietnamPhoneSchema.optional(),
    contactInfo: contactInfoSchema.optional(),
    supportCriteria: supportCriteriaSchema.optional(),
    ageGroups: ageGroupsSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    logoUrl: logoUrlSchema.nullable().optional(),
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
    status: z.enum(visibilityStatuses).optional(),
    province: provinceSchema.optional(),
    q: searchQuerySchema,
  })
  .strict();
export type AdminOrganizationListQuery = z.infer<typeof adminOrganizationListQuerySchema>;

export const publicOrganizationListQuerySchema = paginationQueryWithSort(
  publicOrganizationSortFields,
)
  .extend({
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    province: provinceSchema.optional(),
    ageGroup: z
      .enum(ageGroups)
      .optional()
      .openapi({ description: 'Only organizations that accept toys for this age group.' }),
    q: searchQuerySchema,
  })
  .strict();
export type PublicOrganizationListQuery = z.infer<typeof publicOrganizationListQuerySchema>;

// Responses (Swagger only).
const sharedResponseFields = {
  id: objectIdSchema,
  name: z.string(),
  address: z.string(),
  province: z.string().nullable(),
  contactInfo: z.string(),
  supportCriteria: z.string(),
  description: z.string().nullable(),
  ageGroups: z.array(z.enum(ageGroups)),
  logoUrl: z.string().nullable(),
};

export const publicOrganizationSchema = z
  .object({
    ...sharedResponseFields,
    phone: z.string().optional().openapi({
      description: 'Only for signed-in callers, so numbers cannot be collected anonymously.',
    }),
  })
  .openapi('OrganizationPublic');

export const adminOrganizationSchema = z
  .object({
    ...sharedResponseFields,
    phoneMasked: z.string().openapi({ example: '+8491***5678' }),
    phone: z
      .string()
      .optional()
      .openapi({ description: 'Full number: detail, create and update answers only (GB-35).' }),
    status: z.enum(visibilityStatuses),
    openRequestCount: z.number().int().openapi({
      description: 'Donation requests still in progress (PENDING, ACCEPTED, SHIPPING).',
    }),
    requestCount: z
      .number()
      .int()
      .openapi({ description: 'All donation requests ever sent to it (> 0: cannot be deleted).' }),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .openapi('OrganizationAdmin');

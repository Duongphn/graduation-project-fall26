import {
  isoDateTimeSchema,
  objectIdSchema,
  paginationQueryWithSort,
  searchQuerySchema,
  vietnamPhoneSchema,
} from './common.validation.js';
import { normalizeText } from '../utils/text.js';
import { z } from './zod.js';
import {
  isOrganizationAgeGroup,
  ORGANIZATION_AGE_GROUPS,
  organizationStatuses,
} from '../constants/organization-rules.js';

// Request and response schemas of the charity organization endpoints (FE-02, UC34, UC40).

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
/** UC34, R03 III.7.5.1 (2): what the Admin checked (documents, visit, call). */
const verificationNoteSchema = text(5, 500, 'Ghi chú xác minh cần từ 5 đến 500 ký tự.').openapi({
  example: 'Đã xem giấy phép hoạt động số 123/GP và gọi xác nhận với người phụ trách.',
});
const provinceSchema = text(2, 100, 'Tỉnh/Thành phố cần từ 2 đến 100 ký tự.').openapi({
  example: 'TP. Hồ Chí Minh',
});

/** R03 III.7.5.1 (5)–(6): the one receiving point (GB-51). No district since 01/07/2025. */
export const receivingPointSchema = z
  .object({
    province: provinceSchema,
    ward: text(2, 100, 'Phường/Xã cần từ 2 đến 100 ký tự.').openapi({
      example: 'Phường Nhiêu Lộc',
    }),
    street: text(3, 120, 'Số nhà và tên đường cần từ 3 đến 120 ký tự.').openapi({
      example: '123 Lê Văn Sỹ',
    }),
    openingHours: text(2, 200, 'Giờ nhận cần từ 2 đến 200 ký tự.').openapi({
      example: 'Thứ 2 – Thứ 7, 8:00 – 17:00',
    }),
    contactName: z
      .string()
      .transform(normalizeText)
      .pipe(
        z
          .string()
          .regex(
            /^[\p{L} ]{2,50}$/u,
            'Tên người liên hệ chỉ gồm chữ và khoảng trắng, 2 đến 50 ký tự.',
          ),
      )
      .openapi({ example: 'Nguyễn Thị Lan' }),
    contactPhone: vietnamPhoneSchema,
    acceptsDropOff: z.boolean(),
    acceptsParcel: z.boolean(),
  })
  .strict()
  .refine((point) => point.acceptsDropOff || point.acceptsParcel, {
    message: 'Điểm nhận phải nhận ít nhất một cách bàn giao: mang đến hoặc gửi qua vận chuyển.',
    path: ['acceptsDropOff'],
  })
  .openapi('OrganizationReceivingPointInput');
export type ReceivingPointInput = z.infer<typeof receivingPointSchema>;

const ageGroupSchema = z
  .object({ minAge: z.number().int(), maxAge: z.number().int() })
  .strict()
  .refine(isOrganizationAgeGroup, {
    message: 'Nhóm tuổi phải là 0–12 tháng, 1–3, 3–6, 6–12 hoặc 12+ tuổi.',
  })
  .openapi({
    description: `One of ${ORGANIZATION_AGE_GROUPS.map((group) => `[${group.minAge}, ${group.maxAge})`).join(', ')} (years, half-open).`,
    example: { minAge: 3, maxAge: 6 },
  });

const distinctBy =
  <T>(key: (item: T) => string) =>
  (items: T[]) =>
    new Set(items.map(key)).size === items.length;

/** GB-53: one or more age groups, no repeats. */
const ageGroupsSchema = z
  .array(ageGroupSchema)
  .min(1, 'Chọn ít nhất một nhóm tuổi.')
  .max(ORGANIZATION_AGE_GROUPS.length)
  .refine(
    distinctBy<{ minAge: number; maxAge: number }>((group) => `${group.minAge}-${group.maxAge}`),
    {
      message: 'Nhóm tuổi bị lặp.',
    },
  );

/** GB-53: one or more Active categories (checked against the categories by the service). */
const categoryIdsSchema = z
  .array(objectIdSchema)
  .min(1, 'Chọn ít nhất một danh mục.')
  .max(50)
  .refine(
    distinctBy<string>((id) => id.toLowerCase()),
    { message: 'Danh mục bị lặp.' },
  );

const needsShape = {
  ageGroups: ageGroupsSchema,
  categoryIds: categoryIdsSchema,
  areaProvince: provinceSchema.optional().openapi({
    description: 'Area served (province). Defaults to the province of the receiving point.',
  }),
  // GB-53: set by the Admin only (every route of this schema is an Admin route).
  isRemoteArea: z.boolean().optional(),
  // GB-55: while false, the organization takes no new donation requests.
  isAccepting: z.boolean().optional(),
};

export const createOrganizationBodySchema = z
  .object({
    name: nameSchema,
    address: addressSchema,
    contactInfo: contactInfoSchema,
    supportCriteria: supportCriteriaSchema.optional(),
    // The Admin adds an organization only after checking it (UC34): required.
    verificationNote: verificationNoteSchema,
    receivingPoint: receivingPointSchema,
    ...needsShape,
  })
  .strict()
  .openapi('CreateOrganizationRequest');
export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;

/**
 * Every field is optional. `receivingPoint` replaces the whole point; an organization saved
 * before 17/11/2026 gets its receiving point and needs profile through this edit.
 */
export const updateOrganizationBodySchema = z
  .object({
    name: nameSchema.optional(),
    address: addressSchema.optional(),
    contactInfo: contactInfoSchema.optional(),
    supportCriteria: supportCriteriaSchema.optional(),
    verificationNote: verificationNoteSchema.optional(),
    receivingPoint: receivingPointSchema.optional(),
    ageGroups: ageGroupsSchema.optional(),
    categoryIds: categoryIdsSchema.optional(),
    areaProvince: needsShape.areaProvince,
    isRemoteArea: needsShape.isRemoteArea,
    isAccepting: needsShape.isAccepting,
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

const booleanQuery = (description: string) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true'))
    .openapi({ description, example: 'true' });

const ageQuery = z.coerce.number().int().min(0).max(99).optional();

/** A toy's age range from the query: minAge <= maxAge. */
const withAgeRange = <T extends { minAge?: number | undefined; maxAge?: number | undefined }>(
  query: T,
) => query.minAge === undefined || query.maxAge === undefined || query.minAge <= query.maxAge;

// GB-52 filters of the public list (Charity Organization List, R03 III.5.2.3).
export const publicOrganizationListQuerySchema = paginationQueryWithSort(
  publicOrganizationSortFields,
)
  .extend({
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
    q: searchQuerySchema,
    province: provinceSchema.optional().openapi({
      description: 'Province of the receiving point (accents and case ignored).',
    }),
    minAge: ageQuery.openapi({ description: 'With maxAge: an accepted age group overlaps it.' }),
    maxAge: ageQuery,
    categoryId: objectIdSchema.optional(),
    remoteOnly: booleanQuery('true: only organizations serving a poor or remote area.'),
  })
  .strict()
  .refine(withAgeRange, { message: 'minAge không được lớn hơn maxAge.', path: ['minAge'] });
export type PublicOrganizationListQuery = z.infer<typeof publicOrganizationListQuerySchema>;

/**
 * GB-54 input: the toy's age range and category, plus the Donor's province (the province of
 * the Donor's default address), which only orders the result.
 */
export const organizationSuggestionQuerySchema = z
  .object({
    categoryId: objectIdSchema,
    minAge: z.coerce.number().int().min(0).max(99),
    maxAge: z.coerce.number().int().min(0).max(99),
    province: provinceSchema.optional().openapi({
      description: "The Donor's province: organizations whose receiving point is there come first.",
    }),
  })
  .strict()
  .refine(withAgeRange, { message: 'minAge không được lớn hơn maxAge.', path: ['minAge'] });
export type OrganizationSuggestionQuery = z.infer<typeof organizationSuggestionQuerySchema>;

// Responses (Swagger only).
const ageGroupResponseSchema = z.object({ minAge: z.number(), maxAge: z.number() });

const publicReceivingPointSchema = z
  .object({
    province: z.string(),
    ward: z.string(),
    street: z.string(),
    openingHours: z.string(),
    acceptsDropOff: z.boolean(),
    acceptsParcel: z.boolean(),
  })
  .openapi('OrganizationReceivingPointPublic', {
    description: 'GB-62: the contact name and phone are not public.',
  });

const sharedResponseFields = {
  id: objectIdSchema,
  name: z.string(),
  address: z.string(),
  supportCriteria: z.string().nullable(),
  ageGroups: z.array(ageGroupResponseSchema),
  categoryIds: z.array(z.string()),
  areaProvince: z.string().nullable(),
  isRemoteArea: z.boolean(),
  isAccepting: z.boolean(),
};

export const publicOrganizationSchema = z
  .object({
    ...sharedResponseFields,
    receivingPoint: publicReceivingPointSchema.nullable().openapi({
      description: 'null for an organization saved before receiving points existed.',
    }),
  })
  .openapi('OrganizationPublic');

export const adminOrganizationSchema = z
  .object({
    ...sharedResponseFields,
    contactInfo: z.string(),
    receivingPoint: publicReceivingPointSchema
      .extend({ contactName: z.string(), contactPhone: z.string() })
      .nullable(),
    status: z.enum(organizationStatuses),
    verificationNote: z.string().nullable().openapi({
      description: 'What the Admin checked (UC34); null for an organization saved before it.',
    }),
    verifiedAt: isoDateTimeSchema.nullable().openapi({
      description: 'Set when the Admin adds the organization (UC34).',
    }),
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

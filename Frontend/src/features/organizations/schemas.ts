import { z } from 'zod'

import { ageGroups, visibilityStatuses } from '../../constants/domain'
import { vietnamProvinces } from '../../constants/provinces'
import { imageUrlSchema, phoneSchema, provinceSchema } from '../../schemas/common'
import { enumParam, searchParam } from '../../schemas/list-params'
import type { Organization, OrganizationInput } from './types'

// Mirrors createOrganizationBodySchema in server/src/features/organizations/organizations.schemas.ts.
const text = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, message)

export const organizationFormSchema = z.object({
  name: text(2, 150, 'Tên tổ chức cần từ 2 đến 150 ký tự.'),
  address: text(5, 300, 'Địa chỉ cần từ 5 đến 300 ký tự.'),
  // Empty in a new form (input may be undefined); the output is always a province.
  province: provinceSchema.optional().transform((value, ctx) => {
    if (value) return value
    ctx.addIssue({ code: 'custom', message: 'Chọn tỉnh/thành phố.' })
    return z.NEVER
  }),
  phone: phoneSchema,
  contactInfo: text(2, 300, 'Thông tin liên hệ cần từ 2 đến 300 ký tự.'),
  supportCriteria: text(5, 1000, 'Tiêu chí hỗ trợ cần từ 5 đến 1000 ký tự.'),
  ageGroups: z.array(z.enum(ageGroups)).min(1, 'Chọn ít nhất một nhóm tuổi.'),
  description: z.string().trim().max(2000, 'Mô tả tối đa 2000 ký tự.'),
  logoUrl: imageUrlSchema.nullable(),
})

export type OrganizationFormInput = z.input<typeof organizationFormSchema>
export type OrganizationFormValues = z.output<typeof organizationFormSchema>

export const emptyOrganizationForm: OrganizationFormInput = {
  name: '',
  address: '',
  province: undefined,
  phone: '',
  contactInfo: '',
  supportCriteria: '',
  ageGroups: [],
  description: '',
  logoUrl: null,
}

export const toFormValues = (organization: Organization): OrganizationFormInput => ({
  name: organization.name,
  address: organization.address,
  province: organization.province ?? undefined,
  phone: organization.phone ?? '',
  contactInfo: organization.contactInfo,
  supportCriteria: organization.supportCriteria,
  ageGroups: organization.ageGroups,
  description: organization.description ?? '',
  logoUrl: organization.logoUrl,
})

// An empty description is sent as null on edit (clears it) and left out on create.
export const toInput = (values: OrganizationFormValues, isEdit: boolean): OrganizationInput => {
  const { description, logoUrl, ...rest } = values
  return {
    ...rest,
    ...(description ? { description } : isEdit ? { description: null } : {}),
    ...(logoUrl ? { logoUrl } : isEdit ? { logoUrl: null } : {}),
  }
}

// Filters of the list read from the URL (useListParams).
export const organizationFiltersSchema = z.object({
  status: enumParam(visibilityStatuses),
  province: enumParam(vietnamProvinces),
  q: searchParam,
})

import { z } from 'zod'

import { visibilityStatuses } from '../../constants/domain'
import { enumParam, searchParam } from '../../schemas/list-params'
import type { Organization, OrganizationInput } from './types'

// Mirrors createOrganizationBodySchema in server/src/features/organizations/organizations.schemas.ts.
const text = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, message)

export const organizationFormSchema = z.object({
  name: text(2, 150, 'Tên tổ chức cần từ 2 đến 150 ký tự.'),
  address: text(5, 300, 'Địa chỉ cần từ 5 đến 300 ký tự.'),
  contactInfo: text(2, 300, 'Thông tin liên hệ cần từ 2 đến 300 ký tự.'),
  supportCriteria: text(5, 1000, 'Tiêu chí hỗ trợ cần từ 5 đến 1000 ký tự.'),
})

export type OrganizationFormInput = z.input<typeof organizationFormSchema>
export type OrganizationFormValues = z.output<typeof organizationFormSchema>

export const emptyOrganizationForm: OrganizationFormInput = {
  name: '',
  address: '',
  contactInfo: '',
  supportCriteria: '',
}

export const toFormValues = (organization: Organization): OrganizationFormInput => ({
  name: organization.name,
  address: organization.address,
  contactInfo: organization.contactInfo,
  supportCriteria: organization.supportCriteria,
})

export const toInput = (values: OrganizationFormValues): OrganizationInput => ({ ...values })

// Filters of the list read from the URL (useListParams).
export const organizationFiltersSchema = z.object({
  status: enumParam(visibilityStatuses),
  q: searchParam,
})
